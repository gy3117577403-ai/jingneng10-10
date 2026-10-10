"""Role-separated, real HTTP company-data acceptance using fictional data only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import hashlib
import json
import re
import urllib.request
import uuid
from sem_acceptance import Client
from sem import ROOT, LOCAL

OUT = ROOT / '.local' / 'acceptance' / 'jn-0014'


class DataClient(Client):
    def login_as(self, email=None):
        env = dict(line.split('=', 1) for line in (LOCAL / 'runtime.env').read_text(encoding='utf-8').splitlines() if '=' in line)
        page = self.ok('/login')
        token = re.search(r'name="_token"[^>]*value="([^"]+)"', page).group(1)
        status, _, url = self.request('/login', {'_token': token, 'email': email or env['JINGNENG_DEMO_EMAIL'], 'password': env['JINGNENG_DEMO_PASSWORD']}, form=True)
        assert status == 200 and '/login' not in url, 'Demo role login failed; existing passwords are never reset.'

    def api(self, path='', data=None, file=None, key=None, expected=(200,)):
        headers = {'Accept': 'application/json', 'X-CSRF-TOKEN': self.token}
        body = None
        if data is not None or file:
            data = {**(data or {}), 'request_key': key or str(uuid.uuid4())}
            if file:
                name, raw = file; boundary = 'JN' + uuid.uuid4().hex
                chunks = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in data.items()]
                chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(), raw, f'\r\n--{boundary}--\r\n'.encode()]
                body = b''.join(chunks); headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
            else:
                body = json.dumps(data).encode(); headers['Content-Type'] = 'application/json'
        response = self.open_with_backoff(urllib.request.Request(self.base + '/zh-CN/company-data/api' + path, body, headers))
        raw = response.read(); content = json.loads(raw) if 'json' in response.headers.get('Content-Type', '') else raw
        assert response.status in expected, f'{path}: HTTP {response.status} {str(content)[:500]}'
        return content


def pdf_bytes():
    stream = b'BT /F1 18 Tf 50 740 Td (Fictional data center preview) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream']
    raw = b'%PDF-1.4\n'; offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(raw)); raw += f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n'
    start = len(raw); raw += b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets[1:]: raw += f'{offset:010d} 00000 n \n'.encode()
    return raw + f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    owner = DataClient('http://127.0.0.1:8090'); owner.login_as()
    reviewer = DataClient(owner.base); reviewer.login_as('data-reviewer@jingneng.demo')
    reader = DataClient(owner.base); reader.login_as('data-reader@jingneng.demo')
    owner_id = owner.api()['user_id']; reviewer_id = reviewer.api()['user_id']; reader_id = reader.api()['user_id']
    evidence = {'checked_at': datetime.now().astimezone().isoformat(), 'checks': []}
    def passed(name, detail=True):
        evidence['checks'].append({'name': name, 'passed': True, 'detail': detail}); print('PASS', name, flush=True)
    def rev(client, rid): return client.api(f'/records/{rid}')['record']['revision']
    def publish(rid):
        owner.api(f'/records/{rid}/submit', {'revision': rev(owner, rid), 'reviewer_id': reviewer_id, 'note': '提交虚构资料核对'})
        reviewer.api(f'/records/{rid}/approve', {'revision': rev(reviewer, rid), 'note': '核对虚构资料并发布'})
        return owner.api(f'/records/{rid}')['version']['id']
    try:
        stamp = datetime.now().strftime('%Y%m%d%H%M%S')
        actions = list(owner.api('/configuration')['actions'])
        rules = [{'principal_type': 'user', 'principal_id': uid, 'action': a, 'effect': 'allow'} for uid in [owner_id, reviewer_id] for a in actions]
        read_rules = [{'principal_type': 'user', 'principal_id': reader_id, 'action': a, 'effect': 'allow'} for a in ['discover', 'view']]
        cat = owner.api('/catalog/category/0', {'name': f'通用模块验收（虚构）{stamp}', 'position': 90, 'parent_id': None, 'description': '虚构测试，不用于正式业务', 'enabled': True,
            'fields': [{'key': 'reference', 'label': '关联编号', 'type': 'text', 'required': True, 'options': []}], 'rules': rules + read_rules})['id']
        body = {'category_revision': 1, 'code': 'DEMO-HTTP-001', 'title': '跨部门资料核对（虚构）', 'kind': 'file', 'values': {'reference': 'DEMO-PROJECT-1'}, 'note': '首次建立'}
        key = str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=2) as pool: copies = list(pool.map(lambda _: owner.api(f'/records/{cat}/create', body, key=key), range(2)))
        assert copies[0] == copies[1]; rid = copies[0]['id']; evidence.update(category_id=cat, record_id=rid)
        reader.api(f'/records/{rid}', expected=(403,)); passed('并发创建只生成一条记录，未发布草稿对查阅员不可见', rid)
        raw = pdf_bytes(); (OUT / 'fictional-preview.pdf').write_bytes(raw)
        fid = owner.api(f'/records/{rid}/files', {'revision': rev(owner, rid)}, file=('虚构预览.pdf', raw))['file_id']
        old = publish(rid)
        preview = reader.api(f'/records/{rid}/versions/{old}/files/{fid}'); assert preview.startswith(b'\x89PNG')
        reader.api(f'/records/{rid}/versions/{old}/files/{fid}?download=1', expected=(403,))
        assert owner.api(f'/records/{rid}/versions/{old}/files/{fid}?download=1') == raw
        passed('真实PDF生成页面预览，中文原件下载单独校验', hashlib.sha256(preview).hexdigest())
        revision = rev(owner, rid)
        owner.api(f'/records/{rid}/save', {'revision': revision, 'title': '第二版核对（虚构）', 'values': {'reference': 'DEMO-PROJECT-2'}, 'file_ids': [fid], 'note': '修订关联编号'})
        owner.api(f'/records/{rid}/save', {'revision': revision, 'title': '过期内容', 'values': {'reference': 'BAD'}, 'file_ids': [], 'note': '冲突'}, expected=(409,))
        assert reader.api(f'/records/{rid}')['version']['id'] == old
        new = publish(rid); assert new != old and owner.api(f'/records/{rid}/versions/{old}/files/{fid}?download=1') == raw
        passed('新草稿不覆盖发布版，并发旧写入被拒绝，旧原件保持不变')
        task = owner.api(f'/collaboration/{rid}/task', {'version_id': new, 'title': '补充说明（虚构）', 'description': '核对关联资料', 'due_date': (datetime.now()+timedelta(days=2)).strftime('%Y-%m-%d'), 'assignee_id': reviewer_id})['id']
        inbox = reviewer.ok('/zh-CN/workspace/inbox?scope=mine')
        assert any(i['source']=='data_task' and i['key']==f'data_task:{task}' for i in inbox['items'])
        reviewer.api(f'/collaboration/{task}/task-action', {'revision': 1, 'decision': 'accept', 'result': '开始核对'})
        reviewer.api(f'/collaboration/{rid}/comment', {'version_id': new, 'body': '已核对虚构来源'})
        reviewer.api(f'/collaboration/{task}/task-action', {'revision': 2, 'decision': 'complete', 'result': '虚构资料一致'})
        assert reviewer.api(f'/records/{rid}')['comments'][0]['body'] == '已核对虚构来源'
        passed('协作任务进入统一收件箱并完成，评论绑定版本')
        limited = rules + [{'principal_type': 'user', 'principal_id': reader_id, 'action': a, 'effect': 'allow'} for a in ['discover', 'request']]
        owner.api(f'/catalog/policy/{rid}', {'revision': rev(owner, rid), 'mode': 'custom', 'rules': limited})
        assert not reader.api(f'/records/{rid}')['readable']
        access = reader.api(f'/collaboration/{rid}/request', {'reason': '临时核对', 'days': 1, 'approver_id': owner_id})['id']
        owner.api(f'/collaboration/{access}/access-action', {'revision': 1, 'decision': 'approve', 'note': '核对后收回'})
        assert reader.api(f'/records/{rid}')['readable']
        owner.api(f'/records/{rid}/save', {'revision': rev(owner, rid), 'title': '第三版核对（虚构）', 'values': {'reference': 'DEMO-PROJECT-3'}, 'file_ids': [fid], 'note': '新版'})
        latest = publish(rid); assert reader.api(f'/records/{rid}')['version']['id']==new
        reader.api(f'/records/{rid}?version={latest}', expected=(403,))
        owner.api(f'/collaboration/{access}/access-action', {'revision': 2, 'decision': 'revoke', 'note': '撤回临时授权'})
        reader.api(f'/records/{rid}/versions/{new}/files/{fid}', expected=(403,))
        passed('限时查看锁定批准版本，后续发布不扩权，撤销后预览失效')
        csv = '编号,名称,关联编号\nIMPORT-1,虚构台账一,DEMO-A\nIMPORT-2,虚构台账二,DEMO-B\n'.encode()
        (OUT / 'fictional-import.csv').write_bytes(b'\xef\xbb\xbf'+csv)
        bid = owner.api(f'/imports/stage/{cat}', {}, file=('虚构导入.csv', csv))['id']
        b = owner.api(f'/imports/{bid}'); assert all(not r['errors'] for r in b['rows'])
        key = str(uuid.uuid4()); owner.api(f'/imports/{bid}', {'action':'commit'}, key=key); owner.api(f'/imports/{bid}', {'action':'commit'}, key=key)
        b = owner.api(f'/imports/{bid}'); assert len(b['result'])==2
        owner.api(f'/imports/{bid}', {'action':'undo'}); assert owner.api(f'/imports/{bid}')['state']=='undone'
        reader.api(f'/imports/{bid}', expected=(403,)); passed('导入映射校验、重复确认去重、未使用草稿整批撤销')
        reader.api(f'/export/{cat}', expected=(403,)); exported=owner.api(f'/export/{cat}'); assert '第三版核对'.encode() in exported
        passed('导出只含权限内发布版，普通查阅角色不能导出')
        evidence.update(file_id=fid, published_versions=[old,new,latest], import_id=bid, task_id=task, access_id=access)
    finally:
        (OUT/'company-data-http.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
