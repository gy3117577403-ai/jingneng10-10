"""Real HTTP, private files, MariaDB concurrency and Redis worker acceptance; fictional data only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
import uuid
from sem_acceptance import Client
from sem import ROOT

OUT = ROOT / '.local' / 'acceptance' / 'jn-0009'


class PresalesClient(Client):
    def api(self, suffix, data=None, method=None, key=None, file=None, expected=200):
        headers = {'Accept': 'application/json', 'X-CSRF-TOKEN': self.token, 'X-Request-ID': key or str(uuid.uuid4())}
        body = None
        if file:
            name, raw = file
            boundary = 'JN' + uuid.uuid4().hex
            chunks = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in data.items()]
            chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: text/plain\r\n\r\n'.encode(), raw, f'\r\n--{boundary}--\r\n'.encode()]
            body = b''.join(chunks); headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        elif data is not None:
            body = json.dumps(data).encode(); headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + '/zh-CN/presales/api/inquiries' + suffix, body, headers, method=method)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        assert response.status == expected, f'{suffix}: {response.status} {content[:300]!r}'
        return json.loads(content) if 'json' in response.headers.get('Content-Type', '') else content


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    c = PresalesClient('http://127.0.0.1:8090'); c.login()
    evidence = {'checked_at': datetime.now().astimezone().isoformat(), 'checks': []}
    def passed(name, detail=True):
        evidence['checks'].append({'name': name, 'passed': True, 'detail': detail}); print('PASS', name, flush=True)
    try:
        for kind, label in [('cabinet', '成套'), ('sheet_metal', '钣金')]:
            stamp = datetime.now().strftime('%H%M%S')
            key = str(uuid.uuid4()); payload = {'title': f'自动验收·{label}·{stamp}（虚构）', 'kind': kind}
            # Two independent requests use the same receipt key against the real transactional DB.
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: c.api('', payload, key=key), range(2)))
            assert results[0] == results[1]; iid = results[0]['id']; root = f'/{iid}'
            passed(label + ':并发创建去重', iid)
            raw = f'客户名称：虚构客户·{label}\n期望交期：2026-12-20\n需求说明：{label}验收演示，不用于生产。\n'.encode()
            key = str(uuid.uuid4()); body = {'revision': 1}
            a = c.api(root + '/files', body, key=key, file=(f'{label}需求.txt', raw))
            assert a == c.api(root + '/files', body, key=key, file=(f'{label}需求.txt', raw))
            download = c.api(root + f'/versions/{a["version_id"]}/download')
            assert hashlib.sha256(download).digest() == hashlib.sha256(raw).digest()
            d = c.api(root); assert len(d['documents']) == 1
            passed(label + ':私有原件与上传去重')
            input_data = {'revision': d['record']['revision'], 'version_ids': [a['version_id']]}
            rid = c.api(root + '/runs', input_data)['run_id']
            assert c.api(root + '/runs', input_data)['run_id'] == rid
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline:
                d = c.api(root); run = next(r for r in d['runs'] if r['id'] == rid)
                if run['state'] == 'review': break
                assert run['state'] in ['queued', 'running'], run
                time.sleep(1)
            assert run['state'] == 'review', 'Real queue did not finish'
            assert not d['record']['customer_name'] and d['record']['expected_date'] is None
            assert run['output']['candidates']['expected_date']['sources'][0]['line'] == 2
            assert run['sources'][0]['sha256'] == hashlib.sha256(raw).hexdigest()
            passed(label + ':真实后台与候选不自动写入')
            review = {'decision': 'accept', 'note': '人工核对演示：只采纳客户并修订', 'fields': {'customer_name': f'虚构客户·{label}（已核对）'}}
            key = str(uuid.uuid4())
            with ThreadPoolExecutor(max_workers=2) as pool:
                receipts = list(pool.map(lambda _: c.api(root + f'/runs/{rid}/review', review, key=key), range(2)))
            assert receipts[0] == receipts[1]
            c.api(root + f'/runs/{rid}/review', review, expected=409)
            d = c.api(root)
            assert d['record']['expected_date'] is None and not d['record']['requirements']
            assert sum(e['label'] == '确认候选并更新询价' for e in d['events']) == 1
            passed(label + ':并发审核一次写入与部分采纳')
            # Generate a new draft, then upload a newer version before its review.
            rid2 = c.api(root + '/runs', {'revision': d['record']['revision'], 'version_ids': [a['version_id']]})['run_id']
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline:
                d = c.api(root)
                if d['runs'][0]['state'] == 'review': break
                time.sleep(1)
            b = c.api(root + '/files', {'revision': d['record']['revision'], 'document_id': a['document_id']}, file=(f'{label}需求更新.txt', raw.replace(b'2026-12-20', b'2026-12-21')))
            c.api(root + f'/runs/{rid2}/review', review, expected=409)
            c.api(root + f'/runs/{rid2}/review', {'decision': 'reject', 'note': '版本已更新，保留旧候选来源', 'fields': {}})
            assert c.api(root + f'/versions/{a["version_id"]}/download') == raw
            d = c.api(root); assert len(d['documents'][0]['versions']) == 2
            passed(label + ':新旧版本并存与过期候选阻止', {'inquiry_id': iid, 'old_version': a['version_id'], 'new_version': b['version_id']})
        passed('all', len(evidence['checks']))
    finally:
        (OUT / 'presales-http.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
