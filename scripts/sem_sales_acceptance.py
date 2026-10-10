"""Fictional end-to-end sales handoff against MariaDB/Redis/HTTP, including races."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
import time
import urllib.parse
from sem_presales_acceptance import PresalesClient, OUT


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    c = PresalesClient('http://127.0.0.1:8090'); c.login()
    evidence = {'checked_at': datetime.now().astimezone().isoformat(), 'scenarios': []}
    try:
        for kind, label in [('cabinet', '成套'), ('sheet_metal', '钣金')]:
            companies = c.ok('/zh-CN/presales/api/companies?q=' + urllib.parse.quote('虚构客户'))
            company = next(row for row in companies if label in row['label'])
            iid = c.api('', {'title': f'JN-0011 · {label}销售验收（虚构） · {datetime.now():%H%M%S}', 'kind': kind, 'company_id': company['id']})['id']
            root = f'/{iid}'
            raw = f'客户名称：虚构客户 · {label}\n期望交期：2026-12-20\n需求说明：{label}验收专用虚构需求，不用于生产。\n'.encode()
            file = c.api(root + '/files', {'revision': 1}, file=(f'{label}报价依据.txt', raw))
            rid = c.api(root + '/runs', {'revision': 2, 'version_ids': [file['version_id']]})['run_id']
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                detail = c.api(root); run = next(r for r in detail['runs'] if r['id'] == rid)
                if run['state'] == 'review': break
                assert run['state'] in ['queued', 'running'], run['state']
                time.sleep(1)
            assert run['state'] == 'review'
            assert run['provider']['provider'] == 'simulation' and run['metrics']['usage']['input_tokens'] == 0
            c.api(root + f'/runs/{rid}/review', {'decision':'accept','note':'人工核对虚构原件后确认','fields':{k:v['value'] for k,v in run['output']['candidates'].items()}})
            detail = c.api(root); assert detail['record']['company_id'] == company['id']
            options = c.api(root + '/quote-options')
            body = {'revision': detail['record']['revision'], 'confirmed': True, 'note':'本次报价依据已人工核对，仅作虚构验收', 'version_ids':[file['version_id']],
                'companies_contacts_id':options['contacts'][0]['id'], 'companies_addresses_id':options['addresses'][0]['id'],
                'accounting_payment_conditions_id':options['conditions'][0]['id'], 'accounting_payment_methods_id':options['methods'][0]['id'], 'accounting_deliveries_id':options['deliveries'][0]['id']}
            # Independent keys must still yield the same quotation for one revision.
            with ThreadPoolExecutor(max_workers=2) as pool:
                receipts = list(pool.map(lambda _: c.api(root + '/quote', body), range(2)))
            assert receipts[0]['quote_id'] == receipts[1]['quote_id']
            assert sorted(r['reused'] for r in receipts) == [False, True]
            qid = receipts[0]['quote_id']; page = c.ok('/zh-CN/quotes/' + str(qid))
            assert '查看已确认需求与原件' in page
            assert not c.ok(f'/zh-CN/quotes/{qid}/lines/json')['lines']
            line = c.ok(f'/zh-CN/quotes/{qid}/lines/json/store', {'ordre':1,'label':f'{label}验收产品（虚构）','qty':2,'selling_price':100,'discount':0})['line']
            with ThreadPoolExecutor(max_workers=2) as pool:
                orders = list(pool.map(lambda _: c.request(f'/zh-CN/quotes/{qid}/lines/json/store-order', {'line_ids':[line['id']]}), range(2)))
            assert sum(status == 200 for status,_,_ in orders) == 1
            assert all(status in (200,409,422) for status,_,_ in orders)
            detail = c.api(root); assert len(detail['quotes']) == 1 and len(detail['quotes'][0]['orders']) == 1
            oid = detail['quotes'][0]['orders'][0]['id']
            assert '查看已确认需求与原件' in c.ok(f'/zh-CN/orders/{oid}')
            newer = c.api(root+'/files', {'revision':detail['record']['revision'], 'document_id':file['document_id']}, file=(f'{label}报价依据更新.txt', raw.replace(b'2026-12-20',b'2026-12-21')))
            c.api(root+'/quote',body,expected=409)
            page = c.ok(f'/zh-CN/quotes/{qid}')
            assert '询价已有更新，当前报价依据保持原版' in page
            assert hashlib.sha256(c.api(root+f'/versions/{file["version_id"]}/download')).hexdigest() == hashlib.sha256(raw).hexdigest()
            evidence['scenarios'].append({'kind':kind,'passed':True,'inquiry_id':iid,'quote_id':qid,'order_id':oid,'source_version':file['version_id'],'new_version':newer['version_id'],'concurrent_quote_reused':True,'concurrent_order_statuses':[r[0] for r in orders]})
            print('PASS',label,'客户—资料—模拟提取—人工核对—报价—订单—旧版本追溯',flush=True)
    finally:
        (OUT/'sales-http.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
