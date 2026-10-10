"""Exercise versioned quotation review and technical handoff using fictional HTTP data."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from sem_presales_acceptance import PresalesClient
from sem_acceptance import OUT


def control(client, path, data=None, key=None, expected=(200,)):
    body = json.dumps(data).encode() if data is not None else None
    headers = {'Accept': 'application/json', 'X-CSRF-TOKEN': client.token, 'X-Request-ID': key or str(uuid.uuid4())}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(client.base + '/zh-CN/sales-control/api/' + path, body, headers)
    response = client.open_with_backoff(req)
    raw = response.read()
    content = json.loads(raw) if 'json' in response.headers.get('Content-Type', '') else raw
    assert response.status in expected, f'{path}: HTTP {response.status} {str(content)[:600]}'
    return content


def submission(client, qid):
    c = control(client, f'quotes/{qid}')
    return {'fingerprint': c['fingerprint'], 'reviewer_id': c['users'][0]['id'],
            'version_ids': [f['id'] for f in c['current']['materials']['files']],
            'confirmed': True, 'note': '演示管理员核对虚构测试内容，不是企业正式审批'}


def approve_quote(client, qid):
    rid = control(client, f'quotes/{qid}/submit', submission(client, qid))['review_id']
    control(client, f'quotes/{qid}/reviews/{rid}/decision', {'decision': 'approve', 'confirmed': True, 'note': '已人工核对虚构测试报价'})
    return rid


def make_fixture(client, kind, label):
    companies = client.ok('/zh-CN/presales/api/companies?q=' + urllib.parse.quote('虚构客户'))
    company = next(c for c in companies if label in c['label'])
    iid = client.api('', {'title': f'JN-0012 · {label}核对交接（虚构） · {datetime.now():%H%M%S}', 'kind': kind,
                           'company_id': company['id'], 'requirements': f'{label}虚构验收需求，核对数量、交期和资料。'})['id']
    file = client.api(f'/{iid}/files', {'revision': 1}, file=(f'{label}交接资料.txt', '第一版虚构资料'.encode()))
    options = client.api(f'/{iid}/quote-options')
    qid = client.api(f'/{iid}/quote', {'revision': 2, 'confirmed': True, 'note': '确认虚构报价依据', 'version_ids': [file['version_id']],
        'companies_contacts_id': options['contacts'][0]['id'], 'companies_addresses_id': options['addresses'][0]['id'],
        'accounting_payment_conditions_id': options['conditions'][0]['id'], 'accounting_payment_methods_id': options['methods'][0]['id'],
        'accounting_deliveries_id': options['deliveries'][0]['id']})['quote_id']
    line = client.ok(f'/zh-CN/quotes/{qid}/lines/json/store', {'ordre': 1, 'label': f'{label}虚构产品', 'qty': 2, 'selling_price': 100, 'discount': 0})['line']
    return iid, qid, file, line


def handoff(client, oid):
    c = control(client, f'orders/{oid}')
    return {'fingerprint': c['fingerprint'], 'revision': c['handoff']['revision'] if c['handoff'] else 0,
            'receiver_id': c['users'][0]['id'], 'due_date': '2026-12-20', 'note': '交接虚构资料，等待接收人逐项核对',
            'confirmed': True, 'version_ids': [f['id'] for f in c['current']['materials']['files']], 'checklist': ['产品数量已核对', '资料与待补事项已核对']}


def action(client, oid, name, checked=None):
    c = control(client, f'orders/{oid}')
    return control(client, f'orders/{oid}/action', {'revision': c['handoff']['revision'], 'action': name,
                  'note': '人工处理虚构交接：' + name, 'checked': checked or []})


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    c = PresalesClient('http://127.0.0.1:8090'); c.login()
    evidence = {'checked_at': datetime.now().astimezone().isoformat(), 'scenarios': []}
    try:
        for kind, label in [('cabinet', '成套'), ('sheet_metal', '钣金')]:
            iid, qid, file, line = make_fixture(c, kind, label)
            status, _, _ = c.request(f'/zh-CN/quotes/{qid}/lines/json/store-order', {'line_ids': [line['id']]}); assert status == 409
            body = submission(c, qid)
            with ThreadPoolExecutor(max_workers=2) as pool:
                rows = list(pool.map(lambda _: control(c, f'quotes/{qid}/submit', body), range(2)))
            assert rows[0]['review_id'] == rows[1]['review_id']
            assert sorted(r['reused'] for r in rows) == [False, True]
            rid = rows[0]['review_id']; draft = c.ok(f'/zh-CN/sales-control/api/quotes/{qid}/reviews/{rid}/pdf'); assert draft.startswith(b'%PDF-')
            control(c, f'quotes/{qid}/reviews/{rid}/decision', {'decision': 'reject', 'note': '退回补充虚构包装项', 'confirmed': True})
            extra = c.ok(f'/zh-CN/quotes/{qid}/lines/json/store', {'ordre': 2, 'label': '虚构包装项', 'qty': 1, 'selling_price': 50, 'discount': 0})['line']
            rid2 = approve_quote(c, qid); approved = c.ok(f'/zh-CN/sales-control/api/quotes/{qid}/reviews/{rid2}/pdf')
            assert c.ok(f'/zh-CN/sales-control/api/quotes/{qid}/reviews/{rid}/pdf') == draft
            assert c.ok(f'/zh-CN/pdf/quote/{qid}') == approved
            order = c.ok(f'/zh-CN/quotes/{qid}/lines/json/store-order', {'line_ids': [line['id'], extra['id']]})
            oid = int(order['redirect'].rstrip('/').split('/')[-1]); inp = handoff(c, oid)
            with ThreadPoolExecutor(max_workers=2) as pool:
                sent = list(pool.map(lambda _: control(c, f'orders/{oid}/send', inp, expected=(200, 409)), range(2)))
            assert sum('handoff_id' in r for r in sent) == 1
            action(c, oid, 'accept'); action(c, oid, 'request_info')
            detail = c.api(f'/{iid}')
            newer = c.api(f'/{iid}/files', {'revision': detail['record']['revision'], 'document_id': file['document_id']}, file=(f'{label}补充资料.txt', '第二版虚构资料，补齐要求'.encode()))
            assert control(c, f'orders/{oid}')['stale']
            control(c, f'orders/{oid}/send', handoff(c, oid)); action(c, oid, 'accept'); action(c, oid, 'complete', [0, 1])
            final = control(c, f'orders/{oid}'); assert final['handoff']['state'] == 'completed' and len(final['versions']) == 2
            assert c.ok(f'/zh-CN/sales-control/api/quotes/{qid}/reviews/{rid2}/pdf') == approved
            old_file = c.ok(f'/zh-CN/sales-control/api/orders/{oid}/versions/1/files/{file["version_id"]}')
            assert old_file == '第一版虚构资料'.encode()
            assert '技术交接' in c.ok(f'/zh-CN/sales-control/orders/{oid}')
            evidence['scenarios'].append({'kind': kind, 'passed': True, 'inquiry_id': iid, 'quote_id': qid, 'order_id': oid,
                'reviews': [rid, rid2], 'old_version': file['version_id'], 'new_version': newer['version_id'],
                'draft_sha256': hashlib.sha256(draft).hexdigest(), 'approved_sha256': hashlib.sha256(approved).hexdigest(),
                'concurrent_submit_one_review': True, 'concurrent_send_one_handoff': True, 'history_unchanged': True})
            print('PASS', label, '退回—再确认—固定PDF—订单—交接—补充—完成', flush=True)
    finally:
        (OUT / 'review-handoff-http.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
