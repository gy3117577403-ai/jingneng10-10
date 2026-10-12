"""Real HTTP/worker acceptance; only fictional documents, no model API or credentials."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import time
import uuid
from sem_data_acceptance import DataClient, OUT
from sem_reading_acceptance import word_file


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    owner = DataClient('http://127.0.0.1:8090'); owner.login_as()
    reviewer = DataClient(owner.base); reviewer.login_as('data-reviewer@jingneng.demo')
    reader = DataClient(owner.base); reader.login_as('data-reader@jingneng.demo')
    uid, approver, guest = [c.api()['user_id'] for c in [owner, reviewer, reader]]
    actions = list(owner.api('/configuration')['actions'])
    maintain = [{'principal_type':'user','principal_id':u,'action':a,'effect':'allow'} for u in [uid,approver] for a in actions]
    read = [{'principal_type':'user','principal_id':guest,'action':a,'effect':'allow'} for a in ['discover','view']]
    stamp = datetime.now().strftime('%Y%m%d%H%M%S'); keyword = 'ASSIST-'+stamp
    evidence = {'checked_at':datetime.now().astimezone().isoformat(),'checks':[],'external_model_calls':0}
    def passed(name): evidence['checks'].append({'name':name,'passed':True}); print('PASS',name,flush=True)
    def revision(): return owner.api(f'/records/{rid}')['record']['revision']
    def publish():
        owner.api(f'/records/{rid}/submit',{'revision':revision(),'reviewer_id':approver,'note':'虚构验收资料审核'})
        reviewer.api(f'/records/{rid}/approve',{'revision':revision(),'note':'已核对虚构原文'})
        return owner.api(f'/records/{rid}')['version']['id']
    def wait(ids, client=reader):
        until = time.monotonic()+90
        while time.monotonic()<until:
            d=client.api(f"/assistant/conversations/{ids['id']}")
            r=next(r for r in d['runs'] if r['id']==ids['run_id'])
            if r['state'] not in ['queued','processing']: return r
            time.sleep(1)
        raise AssertionError('The durable assistant job did not finish')
    def ask(**extra): return reader.api('/assistant/ask',dict(question=keyword,keywords=keyword,category_id=cat,mode='excerpt',include_history=False,**extra))
    try:
        cat=owner.api('/catalog/category/0',{'name':'资料助手验收（虚构）'+stamp,'position':30,'parent_id':None,'description':'仅验证来源和权限，不是真实企业资料','enabled':True,
            'fields':[{'key':'ref','label':'验证编号','type':'text','required':True,'options':[]}],'rules':maintain+read})['id']
        rid=owner.api(f'/records/{cat}/create',{'category_revision':1,'code':'DEMO-ASSIST-001','title':'资料助手核对制度（虚构）','kind':'ledger','values':{'ref':'DEMO'},'note':'创建虚构资料'})['id']
        raw=word_file(f'{keyword}：现场核对包括版本、设备编号和密封情况。此文档为虚构验收资料。')
        fid=owner.api(f'/records/{rid}/files',{'revision':revision()},file=('助手来源（虚构）.docx',raw))['file_id']
        until=time.monotonic()+110
        while time.monotonic()<until:
            f=next(f for f in owner.api(f'/records/{rid}')['files'] if f['id']==fid)
            if f['reading']['state']=='ready': break
            assert f['reading']['state'] in ['queued','processing'], f['reading']; time.sleep(1)
        else: raise AssertionError('Word conversion did not complete')
        old=publish(); evidence.update(category_id=cat,record_id=rid,file_id=fid,version_id=old)
        key=str(uuid.uuid4()); body={'question':keyword,'keywords':keyword,'category_id':cat,'mode':'excerpt','include_history':False}
        with ThreadPoolExecutor(max_workers=2) as pool: copies=list(pool.map(lambda _:reader.api('/assistant/ask',body,key=key),range(2)))
        assert copies[0]==copies[1]; ids=copies[0]; result=wait(ids)
        assert result['state']=='ready' and result['mode']=='excerpt'; source=result['sources'][0]
        assert source['page']==2 and source['version_id']==old and source['file_id']==fid
        assert keyword in result['answer']['paragraphs'][0]['text'] and 'body' not in source
        assert reader.api(f'/records/{rid}/versions/{old}/files/{fid}?page=2').startswith(b'\x89PNG')
        reader.api(f'/records/{rid}/versions/{old}/files/{fid}?download=1',expected=(403,))
        owner.api(f"/assistant/conversations/{ids['id']}",expected=(404,))
        passed('并发提交去重，真实后台完成摘录，来源锁定Word第二页，个人会话与下载权限独立')
        reader.api(f"/assistant/items/{ids['run_id']}/feedback",{'feedback':'incorrect','note':'虚构测试反馈'})
        assert wait(ids)['feedback']=='incorrect'
        reader.api('/assistant/ask',dict(body,mode='openai'),expected=(409,))
        reader.api('/assistant/ask',dict(body,mode='demo'),expected=(422,))
        demo=reader.api('/assistant/ask',dict(body,mode='demo',demo_ack=True)); assert wait(demo)['mode']=='demo'
        assert not reader.api('/assistant')['capabilities']['external_requests']
        passed('模拟需明确选择，未绑定套餐的账号不能调用模型，反馈可保存且不伪装为AI推理')
        owner.api(f'/records/{rid}/save',{'revision':revision(),'title':'新版核对制度（虚构）','values':{'ref':'DEMO-NEW'},'file_ids':[],'note':'验证旧版本来源'})
        new=publish(); assert wait(ids)['sources'][0]['historical'] is True
        assert wait(ask())['state']=='no_sources'
        historical=reader.api('/assistant/ask',dict(body,include_history=True)); assert wait(historical)['sources'][0]['version_id']==old
        passed('默认只查当前发布版，旧会话标明来源已有新版，历史范围必须显式选择')
        owner.api(f'/catalog/policy/{rid}',{'revision':revision(),'mode':'custom','rules':maintain+[{'principal_type':'user','principal_id':guest,'action':'discover','effect':'allow'}]})
        hidden=wait(ids); assert hidden['state']=='restricted' and hidden['answer'] is None and hidden['sources']==[] and hidden['retrieval'] is None
        reader.api(f"/assistant/items/{ids['run_id']}/feedback",{'feedback':'helpful'},expected=(409,))
        reader.api(f'/records/{rid}/versions/{old}/files/{fid}?page=2',expected=(403,))
        passed('撤销资料权限后，历史回答、引用、检索摘要和原文同时失效')
        owner.api(f'/catalog/policy/{rid}',{'revision':revision(),'mode':'custom','rules':maintain+read})
        reader.api(f"/assistant/items/{ids['id']}/archive",{})
        archived=reader.api(f"/assistant/conversations/{ids['id']}"); assert archived['conversation']['archived']
        reader.api('/assistant/ask',dict(body,conversation_id=ids['id']),expected=(409,))
        reader.api(f"/assistant/items/{ids['id']}/restore",{})
        follow=reader.api('/assistant/ask',dict(body,question='设备点检需要记录什么？',keywords='未匹配的虚构编号',conversation_id=ids['id']))
        assert wait(follow)['state']=='no_sources'
        passed('会话归档与恢复、持续提问、无来源时不编写答案')
        evidence.update(conversation_id=ids['id'],demo_conversation_id=demo['id'],history_conversation_id=historical['id'])
        # Leave a current, readable fictional source for browser acceptance.
        owner.api(f'/records/{rid}/save',{'revision':revision(),'title':'现场核对与设备点检（虚构）','values':{'ref':'DEMO-READY'},'file_ids':[fid],'note':'保留可操作的虚构试用资料'})
        evidence['latest_version']=publish()
        evidence['owner_conversation']=owner.api('/assistant/ask',dict(body,question='现场核对有哪些要求？'))
        assert wait(evidence['owner_conversation'],owner)['state']=='ready'
        evidence['passed']=True
    finally:
        (OUT/'assistant-http.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
