import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ISSUER, SCOPES, SOURCE, ProbeError, safeCode, newAttempt, validateCallback, validateIdentity, inferencePayload, validateAnswer, readCompletedStream, readInferenceResponse } from './core.mjs';
import { ProtectedStore } from './storage.mjs';

const callback=(attempt,changes={})=>new URLSearchParams({state:attempt.state,code:'fictional-code',client_id:'oaiapp_fixture',...changes});
const fixture={paragraphs:[{text:'需记录演示批次号和实测厚度。',citations:[{source_id:'S1',quote:'来料检验需记录演示批次号和实测厚度。'}]}]};
function stream(events,split=17){
  const bytes=new TextEncoder().encode(events.map(event=>'data: '+JSON.stringify(event)+'\r\n\r\n').join(''));
  return new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=split)controller.enqueue(bytes.slice(i,i+split));controller.close();}});
}
test('fresh PKCE and nonce, loopback callback, and retained client registration',()=>{
  const a=newAttempt('http://127.0.0.1:1234/auth/callback','urn:uuid:fixture'),b=newAttempt('http://127.0.0.1:4567/auth/callback','urn:uuid:fixture','oaiapp_fixture');
  const url=new URL(a.url),returning=new URL(b.url);
  assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('resource'),'https://api.openai.com/v1');
  assert.notEqual(a.attempt.state,b.attempt.state);assert.notEqual(a.attempt.nonce,b.attempt.nonce);
  assert.ok(url.searchParams.get('agent_name_hint'));
  assert.equal(returning.searchParams.get('client_id'),'oaiapp_fixture');assert.equal(returning.searchParams.has('agent_name_hint'),false);
  assert.equal(returning.searchParams.has('id_token_hint'),false);assert.equal(url.searchParams.has('code_verifier'),false);
});
test('callback rejects wrong state, expired attempts and missing or changed client IDs',()=>{
  const {attempt}=newAttempt('http://127.0.0.1:1234/auth/callback','urn:uuid:fixture');
  assert.throws(()=>validateCallback(attempt,callback(attempt,{state:'wrong'})),/invalid_callback/);
  assert.throws(()=>validateCallback({...attempt,expiresAt:0},callback(attempt)),/invalid_callback/);
  assert.throws(()=>validateCallback(attempt,callback(attempt,{client_id:''})),/registration_incomplete/);
  assert.throws(()=>validateCallback({...attempt,clientId:'oaiapp_saved'},callback(attempt)),/registration_mismatch/);
  assert.deepEqual(validateCallback(attempt,callback(attempt)),{code:'fictional-code',clientId:'oaiapp_fixture'});
  const saved={...attempt,clientId:'oaiapp_saved'};
  const parameters=callback(saved);parameters.delete('client_id');
  assert.equal(validateCallback(saved,parameters).clientId,'oaiapp_saved');
});
test('valid-state denial stops before token exchange',()=>{
  const {attempt}=newAttempt('http://127.0.0.1:1234/auth/callback','urn:uuid:fixture');
  assert.throws(()=>validateCallback(attempt,callback(attempt,{error:'access_denied'})),/consent_declined/);
});
test('identity requires signature, audience, nonce, same account and separately granted scopes',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwt=await new SignJWT({nonce:'fixture-nonce',email:'fixture@example.invalid'}).setProtectedHeader({alg:'RS256'}).setIssuer(ISSUER).setSubject('fixture-user').setAudience('oaiapp_fixture').setIssuedAt().setExpirationTime('2m').sign(privateKey);
  const tokens={id_token:jwt,access_token:'fictional-access',token_type:'Bearer',expires_in:3600,scope:SCOPES};
  const identity=await validateIdentity(tokens,'oaiapp_fixture','fixture-nonce',publicKey);
  assert.equal(identity.sharing,true);
  assert.equal((await validateIdentity({...tokens,scope:'openid email profile'},'oaiapp_fixture','fixture-nonce',publicKey)).sharing,false);
  await assert.rejects(validateIdentity(tokens,'oaiapp_other','fixture-nonce',publicKey),/invalid_identity/);
  await assert.rejects(validateIdentity(tokens,'oaiapp_fixture','wrong-nonce',publicKey),/identity_mismatch/);
  await assert.rejects(validateIdentity(tokens,'oaiapp_fixture','fixture-nonce',publicKey,'different-user'),/identity_mismatch/);
  await assert.rejects(validateIdentity({...tokens,id_token:jwt.slice(0,-16)+'invalidsignature'},'oaiapp_fixture','fixture-nonce',publicKey),/invalid_identity/);
});
test('request uses only supported plan fields and fictional source',()=>{
  const request=inferencePayload('fixture-model');
  assert.deepEqual(Object.keys(request).sort(),['model','store','stream','instructions','input'].sort());
  assert.equal(request.store,false);assert.equal(request.stream,true);assert.ok(Array.isArray(request.input));
  assert.equal(JSON.parse(request.input[0].content).sources[0].body,SOURCE);
});
test('SSE handles split Chinese text and requires the terminal completion event',async()=>{
  const result=await readCompletedStream(stream([{type:'response.output_text.delta',delta:'不完整中间结果'},
    {type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture)}]}],usage:{input_tokens:30,output_tokens:20,total_tokens:50}}}]));
  assert.deepEqual(validateAnswer(result.text),fixture);assert.equal(result.usage.total_tokens,50);
  await assert.rejects(readCompletedStream(stream([{type:'response.output_text.delta',delta:'看似成功'}])),/stream_interrupted/);
});
test('quota failure after streamed text is not mistaken for success',async()=>{
  await assert.rejects(readCompletedStream(stream([{type:'response.output_text.delta',delta:'已有片段'},
    {type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])),/subscription_sharing_usage_limit_exceeded/);
  await assert.rejects(readCompletedStream(stream([{type:'response.incomplete'}])),/incomplete_response/);
});
test('deltas are accepted only after a completed event, even if that event omits text',async()=>{
  const result=await readCompletedStream(stream([{type:'response.output_text.delta',delta:JSON.stringify(fixture)},
    {type:'response.completed',response:{status:'completed',output:[],usage:{input_tokens:3,output_tokens:8,total_tokens:11}}}]));
  assert.deepEqual(validateAnswer(result.text),fixture);assert.equal(result.textSource,'streamed_deltas');
  await assert.rejects(readCompletedStream(stream([{type:'response.completed',response:{status:'completed',output:[]}}])),/empty_completed_response/);
  await assert.rejects(readInferenceResponse(new Response(null)),/empty_transport_response/);
});
test('a missing content type still requires valid SSE completion, and HTML cannot pass',async()=>{
  const event={type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fixture)}]}]}};
  const response=new Response(stream([event]));
  assert.equal(response.headers.has('content-type'),false);
  assert.deepEqual(validateAnswer((await readInferenceResponse(response)).text),fixture);
  await assert.rejects(readInferenceResponse(new Response(stream([event]),{headers:{'Content-Type':'text/html'}})),/unexpected_response_type/);
  await assert.rejects(readInferenceResponse(new Response(new TextEncoder().encode('<html>Not a model response</html>'))),/stream_interrupted/);
  await assert.rejects(readInferenceResponse(new Response(stream([{type:'response.output_text.delta',delta:'片段'}]))),/stream_interrupted/);
});
test('answer cannot cite unknown IDs or invented quotes',()=>{
  assert.throws(()=>validateAnswer(JSON.stringify({paragraphs:[{...fixture.paragraphs[0],citations:[{source_id:'S2',quote:'来料检验'}]}]})),/invalid_citation/);
  assert.throws(()=>validateAnswer(JSON.stringify({paragraphs:[{...fixture.paragraphs[0],citations:[{source_id:'S1',quote:'虚构的第二条规则'}]}]})),/invalid_citation/);
});
test('unknown exceptions and credential-bearing messages never become diagnostic text',()=>{
  assert.equal(safeCode(new Error('fictional-secret-token')),'verification_failed');
  assert.equal(safeCode(new ProbeError('invalid_callback')),'invalid_callback');
  assert.equal(safeCode(new ProbeError('sk-fictional')),'verification_failed');
});
test('Windows DPAPI encrypts at rest, survives reopen and fails closed on damage',{skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'jn-plan-dpapi-test-'));
  try{
    const store=new ProtectedStore(directory);await store.init();
    const value={access:'synthetic-token-for-storage-test',registration:'fixture-registration'};
    await store.save(value);
    assert.equal((await readFile(store.file,'utf8')).includes(value.access),false);
    assert.deepEqual(await new ProtectedStore(directory).load(),value);
    const {writeFile}=await import('node:fs/promises');await writeFile(store.file,'damaged');
    await assert.rejects(store.load(),/protected_storage_unreadable/);
    assert.equal(await readFile(store.file,'utf8'),'damaged');
  }finally{
    const resolved=path.resolve(directory),expected=path.resolve(tmpdir());
    if(path.dirname(resolved)!==expected||!path.basename(resolved).startsWith('jn-plan-dpapi-test-'))throw Error('Unexpected cleanup target');
    await rm(resolved,{recursive:true});
  }
});
