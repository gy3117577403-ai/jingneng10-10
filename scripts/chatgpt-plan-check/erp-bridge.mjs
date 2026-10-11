import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { ProtectedStore } from './storage.mjs';
import { ProbeError, safeCode } from './core.mjs';

export async function configureBridge(root,owner) {
  if(!Number.isSafeInteger(owner)||owner<1)throw new ProbeError('invalid_owner');
  const directory=path.join(root,'.local/sem/assistant-bridge');
  await new ProtectedStore(directory).init();
  const binding=path.join(directory,'binding.json'),key=path.join(directory,'bridge.key');
  let existing;try{existing=JSON.parse(await readFile(binding,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing) {
    if(existing.owner_id!==owner)throw new ProbeError('owner_already_bound');
    await bridgeConfiguration(root);return;
  }
  // Fail closed on partial setup instead of replacing a possibly live key.
  await writeFile(key,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
  await writeFile(binding,JSON.stringify({owner_id:owner,model:'gpt-6-luna',url:'http://127.0.0.1:8090'}),{flag:'wx',mode:0o600});
}
export async function bridgeConfiguration(root) {
  const directory=path.join(root,'.local/sem/assistant-bridge');
  for(const file of ['binding.json','bridge.key'])if((await lstat(path.join(directory,file))).isSymbolicLink())throw new ProbeError('unsafe_storage_path');
  const binding=JSON.parse(await readFile(path.join(directory,'binding.json'),'utf8'));
  const key=(await readFile(path.join(directory,'bridge.key'),'utf8')).trim();
  const url=new URL(binding.url);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash
    ||!Number.isSafeInteger(binding.owner_id)||binding.owner_id<1||!/^[a-f0-9]{64}$/.test(key)||!/^[a-zA-Z0-9._-]{1,100}$/.test(binding.model))throw new ProbeError('invalid_bridge_configuration');
  return {...binding,key,url:url.origin};
}
export function signedRequest(key,route,body,time=Math.floor(Date.now()/1000),nonce=randomBytes(16).toString('hex')) {
  const digest=createHash('sha256').update(body).digest('hex');
  const signature=createHmac('sha256',key).update(`${time}\n${nonce}\nPOST\n${route}\n${digest}`).digest('hex');
  return {'Content-Type':'application/json',Accept:'application/json','X-JN-Time':String(time),'X-JN-Nonce':nonce,'X-JN-Signature':signature};
}
export function startErpBridge({configuration,session,getConnection,origin,onStatus,canRun=()=>true}) {
  let stopped=false,running=null,task=null,timer=null,ticking=false,catalogAt=0,lastError=null,desired='enabled';
  const model=configuration.model;
  const call=async(action,data={})=>{
    const route=`/api/jn-assistant-bridge/${action}`,body=JSON.stringify(data);
    let res;try{res=await fetch(configuration.url+route,{method:'POST',redirect:'error',headers:signedRequest(configuration.key,route,body),body,signal:AbortSignal.timeout(8000)});}catch{throw new ProbeError('bridge_unavailable');}
    if(!res.ok)throw new ProbeError('bridge_rejected');return res.json();
  };
  const heartbeat=async()=>{
    const c=getConnection(),connected=!!c?.tokens?.access_token&&!!c.identity?.sharing;
    const email=c?.identity?.email||'';
    const account=email.includes('@')?email.slice(0,2)+'***@'+email.split('@').at(-1):'本机授权账户';
    const status=lastError?'error':connected?(catalogAt&&canRun()?'ready':'reauthorize'):'disconnected';
    const state=await call('heartbeat',{status,account,model,connection_url:origin+'/',error:lastError});
    desired=state.desired;
    return state;
  };
  async function runJob(job) {
    const controller=new AbortController();running=controller;let monitor;
    const timeout=setTimeout(()=>controller.abort(new ProbeError('request_timeout')),90_000);
    let polling=false;
    const check=async()=>{if(polling)return;polling=true;try{const state=await call('progress',{id:job.id,lease:job.lease});if(!state.active)controller.abort(new ProbeError('request_cancelled'));}catch{controller.abort(new ProbeError('bridge_unavailable'));}finally{polling=false;}};
    let result={},error=null;
    try {
      await check();controller.signal.throwIfAborted();
      monitor=setInterval(()=>void check(),1500);
      result=await session.answer(job.request,model,controller.signal);
    }catch(e){error=safeCode(e);result.usage=e.usage||{};}
    finally {clearInterval(monitor);clearTimeout(timeout);running=null;}
    // Retrying result delivery is safe (lease/idempotent usage); inference itself is never retried.
    const receipt={id:job.id,lease:job.lease,model,answer:result.answer||null,usage:result.usage||{},error};
    for(let i=0;i<3&&!stopped;i++)try{await call('complete',receipt);break;}catch{await new Promise(r=>setTimeout(r,1000*(i+1)));}
    if(['authorization_expired','invalid_grant','sharing_not_enabled','subscription_sharing_usage_limit_exceeded','subscription_sharing_user_not_eligible'].includes(error))lastError=error;
  }
  async function tick() {
    if(stopped||ticking)return;ticking=true;
    try {
      if(canRun() && !task && !lastError && getConnection()?.tokens?.access_token && Date.now()-catalogAt>5*60_000) {
        const models=await session.models();if(!models.some(m=>m.slug===model))throw new ProbeError('model_not_found');catalogAt=Date.now();
      }
      await heartbeat();
      if(desired==='checking'&&!task) {
        lastError=null;catalogAt=0;
        try {const models=await session.models();if(!models.some(m=>m.slug===model))throw new ProbeError('model_not_found');catalogAt=Date.now();}
        catch(e){lastError=safeCode(e);}
        await call('heartbeat',{status:catalogAt?'ready':'error',model,connection_url:origin+'/',error:lastError,check_complete:true});
        return;
      }
      if(desired!=='enabled')running?.abort(new ProbeError('request_cancelled'));
      if(desired==='disconnect'&&!task) {
        const confirmed=await session.revoke();catalogAt=0;lastError=confirmed?null:'revocation_unconfirmed';
        // Always acknowledge cleared credentials, even when remote revocation was uncertain.
        await call('heartbeat',{status:'disconnected',model,connection_url:origin+'/',error:lastError});
        onStatus('disconnected',lastError);return;
      }
      if(canRun()&&desired==='enabled'&&!task&&!lastError&&catalogAt) {
        const {job}=await call('claim');
        if(job)task=runJob(job).catch(()=>{}).finally(()=>{task=null;});
      }
    } catch(e) {
      const code=safeCode(e);
      if(code!=='bridge_unavailable'&&code!=='bridge_rejected') { lastError=code;await heartbeat().catch(()=>{}); }
    } finally {ticking=false;}
  }
  void tick();timer=setInterval(()=>void tick(),2500);
  return {stop(){stopped=true;clearInterval(timer);running?.abort(new ProbeError('request_cancelled'));},
    reset(){lastError=null;catalogAt=0;void tick();},get busy(){return !!task;}};
}
