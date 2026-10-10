"""Exercise the real local SEM HTTP flow with fictional records; writes evidence locally."""
import argparse
import hashlib
from datetime import datetime
import http.cookiejar
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from sem import LOCAL, ROOT, compose

OUT = ROOT / '.local' / 'acceptance' / 'jn-0009'


def snapshot(project=None):
    result = compose('exec', '-T', 'app', 'php', '/opt/jingneng-sem/inspect.php', project=project, stdout=subprocess.PIPE)
    return json.loads(result.stdout)


class Client:
    def __init__(self, base):
        self.base = base.rstrip('/')
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None

    def request(self, path, data=None, form=False, method=None):
        if path.startswith('http'):
            parsed = urllib.parse.urlsplit(path)
            path = parsed.path + ('?' + parsed.query if parsed.query else '')
        headers = {'Accept-Language': 'zh-CN'}
        if self.token:
            headers['X-CSRF-TOKEN'] = self.token
        if data is not None:
            if form:
                body = urllib.parse.urlencode(data).encode()
                headers['Content-Type'] = 'application/x-www-form-urlencoded'
            else:
                body = json.dumps(data).encode()
                headers.update({'Content-Type': 'application/json', 'Accept': 'application/json'})
        else:
            body = None
        request = urllib.request.Request(self.base + path, body, headers, method=method)
        try:
            response = self.opener.open(request, timeout=120)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        kind = response.headers.get('Content-Type', '')
        if 'json' in kind:
            payload = json.loads(content)
        elif 'text/' in kind:
            payload = content.decode('utf-8', errors='replace')
            match = re.search(r'<meta\s+name="csrf-token"\s+content="([^"]+)"', payload)
            if match:
                self.token = match.group(1)
        else:
            payload = content
        return response.status, payload, response.geturl()

    def ok(self, path, data=None, form=False, statuses=(200, 201), method=None):
        status, payload, url = self.request(path, data, form, method)
        assert status in statuses, f'{path}: HTTP {status}; {str(payload)[:300]}'
        return payload

    def login(self):
        page = self.ok('/login')
        token = re.search(r'name="_token"[^>]*value="([^"]+)"', page).group(1)
        env = dict(line.split('=', 1) for line in (LOCAL / 'runtime.env').read_text(encoding='utf-8').splitlines() if '=' in line)
        self.ok('/login', {'_token': token, 'email': env['JINGNENG_DEMO_EMAIL'], 'password': env['JINGNENG_DEMO_PASSWORD']}, form=True)
        assert self.token, 'Authenticated CSRF token missing'

    def upload(self, path, fields, filename, content):
        boundary = 'SEM' + secrets.token_hex(16)
        chunks = []
        for key, value in fields.items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        chunks.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="{filename}"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),
            content, f'\r\n--{boundary}--\r\n'.encode(),
        ])
        request = urllib.request.Request(self.base + path, b''.join(chunks), {
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Accept': 'application/json', 'X-CSRF-TOKEN': self.token,
        })
        with self.opener.open(request, timeout=120) as response:
            return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://127.0.0.1:8090')
    parser.add_argument('--read-only', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    checks = []
    evidence = {'started_at': datetime.now().astimezone().isoformat(), 'checks': checks}
    def check(name, action):
        try:
            detail = action()
            checks.append({'name': name, 'passed': True, 'detail': detail})
            print('PASS', name, flush=True)
            return detail
        except Exception as exc:
            checks.append({'name': name, 'passed': False, 'error': str(exc)})
            print('FAIL', name, str(exc)[:300], flush=True)
            return None
    client = Client(args.base)
    try:
        client.login()
        check('authenticated_login', lambda: True)
        before = snapshot()
        evidence['initial_counts'] = before['counts']
        assert before['locale'] == 'zh-CN' and before['timezone'] == 'Asia/Shanghai'
        assert before['debug'] is False and before['default_admin_exists'] is False
        check('chinese_config_and_unique_admin', lambda: True)
        for name, path in before['routes'].items():
            def page(p=path):
                status, payload, url = client.request(p)
                assert status == 200, f'HTTP {status}'
                assert '/login' not in url and '/setup' not in url, url
                requested = p.removeprefix('/zh-CN').rstrip('/')
                landed = urllib.parse.urlsplit(url).path.removeprefix('/zh-CN').rstrip('/')
                assert landed == requested, f'Module redirected to {landed}'
                return {'path': p, 'url': url, 'bytes': len(payload)}
            check('module:' + name, page)
        if args.read_only:
            if not all(item['passed'] for item in checks):
                raise RuntimeError('Read-only module checks failed.')
            return
        def queue_probe():
            result = compose('exec', '-T', 'app', 'php', '/opt/jingneng-sem/inspect.php', 'queue', stdout=subprocess.PIPE)
            identifier = json.loads(result.stdout)['id']
            for _ in range(15):
                result = compose('exec', '-T', 'app', 'php', '/opt/jingneng-sem/inspect.php', 'queue-result', identifier, stdout=subprocess.PIPE)
                data = json.loads(result.stdout or b'{}')
                if data.get('id') == identifier:
                    return data
                time.sleep(1)
            raise AssertionError('Queue worker did not handle the probe.')
        check('background_queue', queue_probe)
        prefix = '/zh-CN'
        for seed in before['quotes']:
            def scenario(quote=seed):
                # Duplicate through the app so original examples remain editable.
                status, copied, target = client.request(prefix + f'/quotes/{quote["id"]}/duplicate', {})
                assert status == 200 and '/quotes/' in target, f'Copy failed: HTTP {status}, {target}'
                qid = int(target.rstrip('/').split('/')[-1])
                lines = client.ok(prefix + f'/quotes/{qid}/lines/json')['lines']
                assert len(lines) == 1
                pdf = client.ok(prefix + f'/pdf/quote/{qid}')
                assert isinstance(pdf, bytes) and pdf.startswith(b'%PDF'), 'Not a PDF'
                (OUT / f'{quote["code"]}.pdf').write_bytes(pdf)
                order = client.ok(prefix + f'/quotes/{qid}/lines/json/store-order', {'line_ids': [lines[0]['id']]})
                oid = int(order['redirect'].rstrip('/').split('/')[-1])
                order_lines = client.ok(prefix + f'/orders/{oid}/lines/json')['lines']
                assert float(order_lines[0]['qty']) == float(lines[0]['qty'])
                duplicate_status, _, _ = client.request(prefix + f'/quotes/{qid}/lines/json/store-order', {'line_ids': [lines[0]['id']]})
                assert duplicate_status == 422, f'Repeat conversion returned {duplicate_status}'
                tasks = [task for task in snapshot()['order_tasks'] if task['order_lines_id'] == order_lines[0]['id']]
                assert len(tasks) == (2 if quote['code'] == 'DEMO-Q-CT' else 3), 'Routing not copied'
                for task in tasks:
                    task_path = prefix + f'/production/Task/Statu/Api/{task["id"]}'
                    client.ok(task_path + '/start', {})
                    client.ok(task_path + '/good-qty', {'qty': lines[0]['qty']})
                    client.ok(task_path + '/finish', {})
                    finished = client.ok(task_path)
                    assert finished['status']['title'] == 'Finished'
                    assert float(finished['total_log_good_qt']) == float(lines[0]['qty'])
                uploaded = client.upload(prefix + '/files/json/store', {
                    'fileable_type': 'order', 'fileable_id': oid, 'comment': '虚构报价 PDF 验收附件',
                }, quote['code'] + '.pdf', pdf)['files'][0]
                downloaded = client.ok(uploaded['download_url'])
                assert hashlib.sha256(downloaded).digest() == hashlib.sha256(pdf).digest()
                guest_status, _, guest_url = Client(args.base).request(uploaded['download_url'])
                assert guest_status in (401, 403) or '/login' in guest_url, 'Anonymous attachment access allowed'
                # Upstream invoice creation also creates delivery lines; this is its native rule.
                invoice = client.ok(prefix + f'/orders/{oid}/lines/json/store-invoice', {'line_ids': [order_lines[0]['id']]})
                iid = int(invoice['redirect'].rstrip('/').split('/')[-1])
                draft_status, _, _ = client.request(prefix + f'/pdf/invoice/{iid}')
                assert draft_status == 403, 'Draft invoice must not be printable'
                client.ok(prefix + f'/invoices/{iid}/emit', {}, method='PATCH')
                invoice_pdf = client.ok(prefix + f'/pdf/invoice/{iid}')
                assert isinstance(invoice_pdf, bytes) and invoice_pdf.startswith(b'%PDF')
                (OUT / f'{quote["code"]}-invoice.pdf').write_bytes(invoice_pdf)
                return {'source_quote_id': quote['id'], 'copy_quote_id': qid, 'order_id': oid, 'invoice_id': iid,
                        'qty': lines[0]['qty'], 'pdf_bytes': len(pdf), 'completed_task_ids': [t['id'] for t in tasks],
                        'attachment_id': uploaded['id'], 'attachment_sha256': hashlib.sha256(pdf).hexdigest()}
            check('quote_order_delivery_invoice:' + seed['code'], scenario)
        def purchase():
            supplier = before['supplier']
            code = 'DEMO-ACCEPT-' + datetime.now().strftime('%Y%m%d%H%M%S')
            created = client.ok(prefix + '/purchases/json/store', {
                'code': code, 'label': '虚构演示采购验收', 'companies_id': supplier['id'],
                'companies_contacts_id': supplier['contact_id'], 'companies_addresses_id': supplier['address_id'],
                'comment': 'JN-0007 自动验收生成的虚构记录。',
            })
            pid = int(created['redirect'].rstrip('/').split('/')[-1])
            line = client.ok(prefix + f'/purchases/{pid}/lines/json/store', {
                'ordre': 1, 'code': 'DEMO-SHEET-2MM', 'label': '演示钢板', 'qty': 10,
                'selling_price': 200, 'discount': 0, 'product_id': before['sheet_product']['id'],
            })['line']
            receipt = client.ok(prefix + f'/purchases/{pid}/lines/json/store-receipt', {'line_ids': [line['id']]})
            client.ok(receipt['redirect'])
            rid = int(receipt['redirect'].rstrip('/').split('/')[-1])
            receipt_line = client.ok(prefix + f'/purchases/receipt/{rid}/lines/json')['lines'][0]
            stock = client.ok(prefix + '/products/stock/location/product/create/purchase-order', {
                'code': code + '-STOCK', 'user_id': before['admin_id'],
                'stock_locations_id': before['raw_location_id'], 'products_id': before['sheet_product']['id'],
                'mini_qty': 0, 'purchase_receipt_line_id': receipt_line['id'], 'component_price': 200,
            })
            position = next(row for row in snapshot()['stock_positions'] if row['id'] == stock['stock_location_products_id'])
            assert float(position['qty']) == 10, position
            return {'purchase_id': pid, 'line_id': line['id'], 'receipt': receipt['redirect'], 'stock_position': position}
        check('purchase_and_receipt', purchase)
        after = snapshot()
        evidence['final_counts'] = after['counts']
    except Exception as exc:
        checks.append({'name': 'acceptance_execution', 'passed': False, 'error': str(exc)})
        raise
    finally:
        evidence['passed'] = all(item['passed'] for item in checks) and bool(checks)
        evidence['finished_at'] = datetime.now().astimezone().isoformat()
        (OUT / ('read-only.json' if args.read_only else 'http-acceptance.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if not evidence['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
