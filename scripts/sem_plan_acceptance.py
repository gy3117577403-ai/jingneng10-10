"""Real ERP HTTP acceptance with a synthetic local bridge; never calls a model."""
from datetime import datetime
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from sem_data_acceptance import DataClient
from sem import LOCAL, ROOT


def main():
    directory = LOCAL / 'assistant-bridge'
    directory.mkdir(exist_ok=True)
    binding, secret = directory / 'binding.json', directory / 'bridge.key'
    if binding.exists() or secret.exists():
        raise SystemExit('Existing bridge configuration preserved; run this fixture in an isolated demo.')
    owner = DataClient('http://127.0.0.1:8090'); owner.login_as()
    reviewer = DataClient(owner.base); reviewer.login_as('data-reviewer@jingneng.demo')
    reader = DataClient(owner.base); reader.login_as('data-reader@jingneng.demo')
    uid, approver, guest = [c.api()['user_id'] for c in (owner, reviewer, reader)]
    key = secrets.token_hex(32)
    secret.write_text(key, encoding='utf-8')
    binding.write_text(json.dumps({'owner_id': guest}), encoding='utf-8')
    checks = []

    def passed(name):
        checks.append(name); print('PASS', name, flush=True)

    def bridge(action, data=None, replay=None):
        path = '/api/jn-assistant-bridge/' + action
        raw = json.dumps(data or {}, ensure_ascii=False).encode('utf-8')
        stamp, nonce = str(int(time.time())), secrets.token_hex(16)
        signature = hmac.new(key.encode(), (stamp+'\n'+nonce+'\nPOST\n'+path+'\n'+hashlib.sha256(raw).hexdigest()).encode(), hashlib.sha256).hexdigest()
        headers = replay or {'Content-Type':'application/json', 'Accept':'application/json', 'X-JN-Time':stamp, 'X-JN-Nonce':nonce, 'X-JN-Signature':signature}
        try:
            with urllib.request.urlopen(urllib.request.Request(owner.base+path, raw, headers), timeout=15) as response:
                return response.status, json.load(response), headers
        except urllib.error.HTTPError as error:
            return error.code, {}, headers

    def ready():
        assert bridge('heartbeat', {'status':'ready', 'model':'fixture-model', 'account':'虚构连接'})[0] == 200

    def ask(question='虚构现场检查'):
        return reader.api('/assistant/ask', {'question':question, 'keywords':question, 'mode':'openai', 'include_history':False, 'category_id':cat})

    def detail(ids):
        return reader.api(f"/assistant/conversations/{ids['id']}")['runs'][-1]

    def complete(job):
        source = job['request']['sources'][0]
        return bridge('complete', {'id':job['id'], 'lease':job['lease'], 'model':'fixture-model', 'usage':{'input_tokens':10,'output_tokens':5,'total_tokens':15},
            'answer':{'paragraphs':[{'text':source['excerpt'], 'citations':[{'source_id':source['id'], 'quote':source['excerpt']}]}]}})

    try:
        ready()
        assert reader.api('/assistant')['capabilities']['openai'] is True
        assert owner.api('/assistant')['capabilities']['connection'] is None
        status, _, headers = bridge('heartbeat', {'status':'ready', 'model':'fixture-model'})
        assert status == 200
        assert bridge('heartbeat', {'status':'ready', 'model':'fixture-model'}, headers)[0] == 409
        headers['X-JN-Nonce'] = secrets.token_hex(16)
        assert bridge('heartbeat', {'status':'ready', 'model':'fixture-model'}, headers)[0] == 403
        passed('签名接口防重放和篡改，套餐仅绑定账号可见')
        actions = list(owner.api('/configuration')['actions'])
        maintain = [{'principal_type':'user','principal_id':u,'action':a,'effect':'allow'} for u in [uid,approver] for a in actions]
        read = [{'principal_type':'user','principal_id':guest,'action':a,'effect':'allow'} for a in ['discover','view']]
        cat = owner.api('/catalog/category/0', {'name':'套餐桥接测试（虚构）'+datetime.now().strftime('%H%M%S'), 'enabled':True, 'parent_id':None, 'position':30,
            'description':'无外部模型调用的协议验收', 'fields':[{'key':'note','label':'说明','type':'text','required':False,'options':[]}], 'rules':maintain+read})['id']
        rid = owner.api(f'/records/{cat}/create', {'category_revision':1,'code':'DEMO-PLAN-001','kind':'ledger','title':'虚构现场检查',
            'values':{'note':'虚构现场检查应记录设备编号与密封情况。'}, 'note':'测试夹具'})['id']
        revision = lambda: owner.api(f'/records/{rid}')['record']['revision']
        owner.api(f'/records/{rid}/submit', {'revision':revision(),'reviewer_id':approver,'note':'仅测试'})
        reviewer.api(f'/records/{rid}/approve', {'revision':revision(),'note':'虚构审核'})
        version = owner.api(f'/records/{rid}')['version']['id']
        ready(); ids = ask(); job = bridge('claim')[1]['job']
        assert job and 'record_id' not in job['request']['sources'][0]
        assert bridge('claim')[1]['job'] is None
        assert complete(job)[1]['accepted'] is True
        assert complete(job)[1]['accepted'] is False
        result = detail(ids)
        assert result['state'] == 'ready' and result['sources'][0]['version_id'] == version
        assert len(result['provider']['attempts']) == 1 and result['provider']['attempts'][0]['usage']['total_tokens'] == 15
        passed('权限内领取固定版本，结果与用量去重，模型输入不包含内部记录定位')
        ready(); cancelled = ask(); job = bridge('claim')[1]['job']
        reader.api(f"/assistant/items/{cancelled['run_id']}/cancel", {})
        assert bridge('progress', {'id':job['id'],'lease':job['lease']})[1]['active'] is False
        assert complete(job)[1]['accepted'] is False
        result = detail(cancelled)
        assert result['state'] == 'cancelled' and result['answer'] is None and result['provider']['attempts'][0]['usage']['total_tokens'] == 15
        passed('取消不会被迟到回答覆盖，完整返回的用量仍有记录')
        reader.api('/assistant/connection', {'action':'pause'}); ready()
        assert reader.api('/assistant')['capabilities']['openai'] is False
        reader.api('/assistant/connection', {'action':'enable'})
        empty = ask('绝不匹配的虚构内容')
        assert bridge('claim')[1]['job'] is None and detail(empty)['state'] == 'no_sources'
        passed('暂停持久有效，无来源不领取模型任务')
        owner.api(f'/catalog/policy/{rid}', {'revision':revision(),'mode':'custom','rules':maintain})
        hidden = detail(ids)
        assert hidden['state'] == 'restricted' and hidden['answer'] is None and hidden['sources'] == []
        passed('权限撤销隐藏已完成回答与固定版本引用')
        out = ROOT / '.local/acceptance/jn-0017'
        out.mkdir(parents=True, exist_ok=True)
        (out/'bridge-http.json').write_text(json.dumps({'passed':True,'model_calls':0,'checks':checks}, ensure_ascii=False, indent=2), encoding='utf-8')
    finally:
        # Only the two files this isolated fixture created; never touch an existing connection.
        binding.unlink(missing_ok=True); secret.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
