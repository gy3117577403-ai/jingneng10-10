import http from 'node:http';
import { mkdir, readFile, writeFile, appendFile, rename, open, unlink, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRemoteJWKSet } from 'jose';
import { ProtectedStore } from './storage.mjs';
import { ISSUER, RESOURCE, ProbeError, safeCode, randomSecret, equalSecret, newAttempt,
  validateCallback, validateIdentity, inferencePayload, validateAnswer, apiErrorCode, readInferenceResponse } from './core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../..');
const directory=path.join(root,'.local/sem/chatgpt-plan-check');
const reports=path.join(root,'.local/acceptance/chatgpt-plan-check');
const store=new ProtectedStore(directory);
const lockPath=path.join(directory,'process.lock');
let lock, server, connection, hostId, pending, pendingUrl, busy=false, runningRequest, origin, signingExpiry, idleExpiry;
let status={phase:'ready',connected:false,sharing:false,verified:false};
const csrf=randomSecret(), browserSession=randomSecret();
const jwks=createRemoteJWKSet(new URL('/.well-known/jwks.json',ISSUER),{timeoutDuration:20_000});
const messages={ ready:'准备就绪，请通过 ChatGPT 登录授权。', authorizing:'请在 OpenAI 官方页面完成登录，并授权使用套餐额度。',
  exchanging:'正在核验登录身份与授权…', connected:'登录身份已核验，正在查询此连接的可用模型…', verifying:'正在使用套餐授权发送一条虚构资料测试…',
  complete:'套餐调用已完成，虚构资料回答及原文引用校验通过。', failed:'本次验证未通过。', cancelled:'授权已取消。' };
const errors={ consent_declined:'你取消了授权，未发送模型请求。', sharing_not_enabled:'登录成功，但没有授予套餐使用权限。',
  subscription_sharing_user_not_eligible:'当前账号或应用暂不具备套餐调用资格。', subscription_sharing_usage_limit_exceeded:'此连接的套餐使用额度已达上限，请到 ChatGPT 用量设置查看。',
  subscription_sharing_usage_unavailable:'暂时无法核对套餐额度，请稍后再试。', subscription_sharing_route_not_supported:'官方接口未允许此连接使用当前调用路线。',
  protected_storage_failed:'Windows 本机加密存储不可用，未保存明文凭据。', protected_storage_unreadable:'无法解密已有连接，已保留原文件。',
  invalid_identity:'登录身份校验未通过。', identity_mismatch:'授权返回的账号或登录校验信息不匹配。', invalid_grant:'授权码已失效，可以重新登录；已保留注册信息。',
  authorization_timeout:'本次登录等待已超时，可以重新发起。', transport_failed:'无法连接官方接口，请检查网络。',
  invalid_citation:'模型返回的引用与虚构原文不一致。', answer_mismatch:'模型已返回，但回答未通过测试内容核验。',
  no_models:'此连接没有返回可选择的模型。', incomplete_response:'模型响应未完整结束。', stream_interrupted:'连接在模型完成前中断。',
  unexpected_response_type:'接口返回了非预期的响应格式，套餐授权已保留。', invalid_stream_event:'流式响应中的事件无法解析，套餐授权已保留。',
  empty_transport_response:'接口没有返回响应正文，套餐授权已保留。', empty_completed_response:'模型报告已结束，但没有返回回答文本。',
  authorization_expired:'现有授权已过期，请通过 ChatGPT 重新登录。' };

function canVerify() { return Boolean(connection?.identity?.sharing && connection?.tokens?.access_token && connection.expiresAt>Date.now()+30_000); }

async function publish(phase, extra={}) {
  status={...status,phase,...extra,updated_at:new Date().toISOString(),message:messages[phase]||phase};
  if(status.error)status.message=errors[status.error]||'本次验证未通过，请查看错误标识后再处理。';
  const receipt={...status,provider:'chatgpt-plan-oauth',business_data_sent:false,ordinary_api_key_used:false};
  const temp=path.join(reports,`${randomUUID()}.tmp`);
  await writeFile(temp,JSON.stringify(receipt,null,2));
  await rename(temp,path.join(reports,'latest.json'));
  await appendFile(path.join(reports,'history.ndjson'),JSON.stringify(receipt)+'\n');
}
async function officialJson(url, options={}) {
  let response;
  try { response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(25_000)}); }
  catch { throw new ProbeError('transport_failed'); }
  const text=await response.text();
  if(text.length>1_000_000)throw new ProbeError('response_too_large');
  let body;
  try { body=JSON.parse(text); } catch { throw new ProbeError('invalid_provider_response'); }
  if(!response.ok)throw new ProbeError(apiErrorCode(body));
  return body;
}
async function verifyPlan() {
  if(!connection?.identity?.sharing || !connection?.tokens?.access_token)throw new ProbeError('sharing_not_enabled');
  if(connection.expiresAt<=Date.now()+30_000)throw new ProbeError('authorization_expired');
  await publish('connected',{connected:true,sharing:true,error:null});
  const catalog=await officialJson(`${RESOURCE}/models`,{headers:{Authorization:`Bearer ${connection.tokens.access_token}`}});
  const models=Array.isArray(catalog.models)?catalog.models.filter(m=>m.visibility==='list'&&typeof m.slug==='string'):[];
  if(!models.length)throw new ProbeError('no_models');
  const chosen=models.find(m=>m.slug==='gpt-6-luna')||models.find(m=>m.slug.includes('mini'))||models[0];
  await publish('verifying',{model:chosen.slug,model_count:models.length});
  runningRequest=new AbortController();
  let response;
  try { response=await fetch(`${RESOURCE}/responses`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${connection.tokens.access_token}`,'Content-Type':'application/json','Accept':'text/event-stream'},
    body:JSON.stringify(inferencePayload(chosen.slug)),signal:AbortSignal.any([runningRequest.signal,AbortSignal.timeout(90_000)])}); }
  catch { throw new ProbeError('transport_failed'); }
  if(!response.ok) {
    let body;try{body=await response.json();}catch{}
    throw new ProbeError(apiErrorCode(body));
  }
  const responseType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  await publish('verifying',{http_status:response.status,response_type:responseType,response_body_present:Boolean(response.body)});
  if(responseType && responseType!=='text/event-stream') {
    // Only record protocol shape, never provider text, credentials or account identifiers.
    let body;try{body=await response.json();}catch{}
    await publish('verifying',{returned_object:body?.object==='response'?'response':null,
      returned_status:['completed','failed','incomplete','in_progress'].includes(body?.status)?body.status:null,
      has_output:Array.isArray(body?.output),provider_error:body?.error?apiErrorCode(body):null});
    throw new ProbeError('unexpected_response_type');
  }
  const result=await readInferenceResponse(response);
  const answer=validateAnswer(result.text);
  await publish('complete',{verified:true,terminal_event:'response.completed',answer,text_source:result.textSource,usage:result.usage});
}
async function finishAuthorization(attempt, values) {
  busy=true;
  try {
    await publish('exchanging',{error:null});
    connection={...connection,clientId:values.clientId};
    await store.save(connection); // Preserve registration even if exchange fails; never create a duplicate client silently.
    const tokenResponse=await officialJson(`${ISSUER}/api/accounts/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'authorization_code',client_id:values.clientId,code:values.code,code_verifier:attempt.verifier,redirect_uri:attempt.redirectUri,resource:RESOURCE})});
    const identity=await validateIdentity(tokenResponse,values.clientId,attempt.nonce,jwks,connection.identity?.subject);
    connection={clientId:values.clientId,identity,tokens:tokenResponse,expiresAt:Date.now()+tokenResponse.expires_in*1000,savedAt:new Date().toISOString()};
    await store.save(connection);
    if(!identity.sharing)throw new ProbeError('sharing_not_enabled');
    await verifyPlan();
  } catch(error) { await publish('failed',{error:safeCode(error),verified:false}); }
  finally { busy=false; runningRequest=null; }
}
function send(response,code,body,type='application/json; charset=utf-8',extra={}) {
  response.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",...extra});
  response.end(typeof body==='string'?body:JSON.stringify(body));
}
async function route(request,response) {
  if(request.headers.host!==new URL(origin).host)return send(response,403,{error:'invalid_host'});
  const url=new URL(request.url,origin);
  if(url.pathname==='/auth/callback'&&request.method==='GET') {
    let values;
    try { values=validateCallback(pending,url.searchParams); }
    catch(error) {
      if(safeCode(error)!=='invalid_callback') { pending=null;pendingUrl=null;clearTimeout(signingExpiry);await publish('failed',{error:safeCode(error)}); }
      return send(response,400,'授权返回未通过校验。请回到验证页查看。','text/plain; charset=utf-8');
    }
    const attempt=pending;pending=null;pendingUrl=null;clearTimeout(signingExpiry);
    send(response,303,'','text/plain',{'Location':'/'});
    void finishAuthorization(attempt,values).catch(()=>{});
    return;
  }
  if(url.pathname==='/'&&request.method==='GET') {
    return send(response,200,await readFile(path.join(here,'index.html'),'utf8'),'text/html; charset=utf-8',{'Set-Cookie':`jn_plan_session=${browserSession}; HttpOnly; SameSite=Strict; Path=/`});
  }
  if(['/client.js','/style.css'].includes(url.pathname)&&request.method==='GET')return send(response,200,await readFile(path.join(here,url.pathname.slice(1)),'utf8'),url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
  const cookies=Object.fromEntries((request.headers.cookie||'').split(';').filter(v=>v.includes('=')).map(v=>v.trim().split('=')));
  if(!equalSecret(cookies.jn_plan_session,browserSession))return send(response,403,{error:'local_session_required'});
  if(url.pathname==='/status'&&request.method==='GET')return send(response,200,{...status,can_verify:canVerify(),csrf});
  if(request.method!=='POST'||request.headers.origin!==origin||!equalSecret(request.headers['x-jn-csrf'],csrf))return send(response,403,{error:'request_rejected'});
  if(url.pathname==='/connect') {
    if(busy)return send(response,409,{error:'verification_busy'});
    // Resume the same request after ordinary login, without rotating PKCE or state.
    if(pending && Date.now()<pending.expiresAt)return send(response,200,{url:pendingUrl});
    clearTimeout(signingExpiry);
    // Reserve synchronously so concurrent clicks reuse one attempt and cannot race registration.
    const prepared=newAttempt(`${origin}/auth/callback`,hostId,connection?.clientId);
    pending=prepared.attempt;pendingUrl=prepared.url;
    await publish('authorizing',{error:null,connected:false,sharing:false,verified:false,model:null,model_count:null,answer:null,usage:null,terminal_event:null,
      http_status:null,response_type:null,returned_object:null,returned_status:null,has_output:null,provider_error:null});
    signingExpiry=setTimeout(()=>{pending=null;pendingUrl=null;void publish('failed',{error:'authorization_timeout'});},10*60_000);
    return send(response,200,{url:prepared.url});
  }
  if(url.pathname==='/verify') {
    if(busy||pending)return send(response,409,{error:'verification_busy'});
    if(!canVerify())return send(response,409,{error:'authorization_expired'});
    busy=true;
    await publish('connected',{error:null,verified:false,answer:null,usage:null,terminal_event:null,
      http_status:null,response_type:null,returned_object:null,returned_status:null,has_output:null,provider_error:null});
    send(response,202,{started:true});
    void verifyPlan().catch(error=>publish('failed',{error:safeCode(error),verified:false})).finally(()=>{busy=false;runningRequest=null;});
    return;
  }
  return send(response,404,{error:'not_found'});
}
async function cleanup() {
  pending=null;pendingUrl=null;runningRequest?.abort();clearTimeout(signingExpiry);clearTimeout(idleExpiry);
  if(server)server.closeAllConnections();
  if(lock){await lock.close();await unlink(lockPath).catch(()=>{});lock=null;}
  process.exit(0);
}
async function main() {
  await mkdir(reports,{recursive:true});
  await store.init();
  try { lock=await open(lockPath,'wx'); }
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    const pid=Number(await readFile(lockPath,'utf8'));
    let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw new ProbeError('already_running');
    await unlink(lockPath);lock=await open(lockPath,'wx');
  }
  await lock.writeFile(String(process.pid));
  const hostPath=path.join(directory,'host.json');
  try { if((await lstat(hostPath)).isSymbolicLink())throw new ProbeError('unsafe_storage_path');await readFile(hostPath); }
  catch(error){if(error.code!=='ENOENT')throw error;await writeFile(hostPath,JSON.stringify({id:`urn:uuid:${randomUUID()}`}),{flag:'wx'});}
  hostId=JSON.parse(await readFile(hostPath,'utf8')).id;
  if(typeof hostId!=='string'||!/^urn:uuid:[0-9a-f-]{36}$/i.test(hostId))throw new ProbeError('invalid_host_identifier');
  connection=await store.load();
  server=http.createServer((req,res)=>{void route(req,res).catch(()=>send(res,500,{error:'local_error'}));});
  server.requestTimeout=10_000;server.headersTimeout=10_000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  await publish('ready',{connected:Boolean(connection?.identity),sharing:Boolean(connection?.identity?.sharing)});
  await writeFile(path.join(reports,'runtime.json'),JSON.stringify({pid:process.pid,url:origin,started_at:new Date().toISOString()},null,2));
  process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
  idleExpiry=setTimeout(cleanup,30*60_000);
  console.log(JSON.stringify({status:'ready',url:origin,credential_storage:'Windows DPAPI CurrentUser',expires_after_minutes:30}));
}
main().catch(async error=>{console.error(JSON.stringify({error:safeCode(error)}));if(lock){await lock.close();await unlink(lockPath).catch(()=>{});}process.exitCode=1;});
