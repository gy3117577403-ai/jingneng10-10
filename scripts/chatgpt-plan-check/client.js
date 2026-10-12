let csrf='',phase='',canVerify=false,erpMode=false;
const button=document.querySelector('#connect');
const names={ready:'等待授权',authorizing:'等待你完成官方授权',exchanging:'核验身份',connected:'已登录，正在查询模型',verifying:'正在进行真实调用',complete:'验证通过',failed:'验证未通过',cancelled:'已取消'};
async function refresh(){
  try{
    const response=await fetch('/status',{cache:'no-store'}),status=await response.json();
    if(!response.ok)throw Error();
    csrf=status.csrf;phase=status.phase;canVerify=status.can_verify;
    erpMode=status.erp_mode;
    document.querySelector('#phase').textContent=phase==='ready'&&canVerify?'套餐授权已恢复':names[phase]||'状态未知';
    document.querySelector('#detail').textContent=phase==='ready'&&canVerify?'本机已安全恢复现有授权，可直接验证模型调用。':status.message+(status.error?'（'+status.error+'）':'');
    document.querySelector('#model').textContent=status.model?'验证模型：'+status.model:'';
    document.querySelector('#dot').className='dot '+phase;
    button.disabled=['exchanging','connected','verifying','complete'].includes(phase);
    button.textContent=phase==='complete'?'套餐连接已验证':phase==='authorizing'?'继续本次应用授权':canVerify?'使用已有授权验证':phase==='failed'?'重新通过 ChatGPT 授权':'通过 ChatGPT 继续';
    if(erpMode){
      document.title='京能 · 资料助手连接';document.querySelector('.tag').textContent='本机连接';
      document.querySelector('.intro').textContent='为软件中的资料助手连接个人 ChatGPT 套餐。';
      document.querySelector('.panel ol').lastElementChild.textContent='回到软件，选择 AI 解读并提交问题。不会自动发送测试资料。';
      document.querySelector('.note').textContent='授权由 Windows 本机加密保存。仅绑定的软件账号可以使用，提问与有权查看的来源片段会发送给 OpenAI。';
      document.querySelector('footer').textContent='本机个人连接。可在软件中暂停使用或断开授权。';
      if(status.authorized&&phase==='ready'){
        document.querySelector('#phase').textContent='套餐授权已保存';
        document.querySelector('#detail').textContent='可以返回公司资料助手。连接状态、暂停和单次用量在软件内查看。';
        button.textContent='重新通过 ChatGPT 授权';button.disabled=false;
      }
    }
    const answer=document.querySelector('#answer');answer.replaceChildren();
    for(const paragraph of status.answer?.paragraphs||[]){const p=document.createElement('p');p.textContent=paragraph.text;answer.append(p);for(const citation of paragraph.citations){const q=document.createElement('blockquote');q.textContent='虚构来源 '+citation.source_id+'：'+citation.quote;answer.append(q);}}
  }catch{document.querySelector('#phase').textContent='本机验证程序未连接';document.querySelector('#detail').textContent='程序可能已关闭或超过等待时间，请回到聊天继续。';button.disabled=true;}
}
button.addEventListener('click',async()=>{
  button.disabled=true;
  try{const response=await fetch(!erpMode&&canVerify&&phase!=='authorizing'?'/verify':'/connect',{method:'POST',headers:{'X-JN-CSRF':csrf}});const result=await response.json();if(!response.ok)throw Error();if(result.url)window.location.assign(result.url);else await refresh();}
  catch{await refresh();}
});
refresh();setInterval(refresh,2000);
