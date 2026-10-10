"""Live F1 acceptance: access boundaries, atomic actions, versions, export and restart.

Only generates explicitly fictional demonstration records. No external model calls.
Run --prepare-restart once, restart the stack, then --verify-restart. A successful
full run archives its test records; restart evidence remains in ignored .local.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import io
import json
import os
import sys
from urllib.parse import urlencode, unquote, quote
import uuid
import zipfile

from dev import ROOT, read_env
from smoke import Client, check, resource

PREFIX = '/api/method/jingneng.api.workbench.'
SALES = 'sales.demo@example.invalid'
TECH = 'tech.demo@example.invalid'
RESULTS = []
FIELDS = ('title', 'business_type', 'customer_name', 'department', 'collaborator', 'expected_date', 'notes', 'items')


def uid(): return str(uuid.uuid4())
def verify(condition, label): check(condition, label, RESULTS)


def call(client, method, data=None, write=False, expected=200):
    data = data or {}
    path = PREFIX + method + (('?' + urlencode(data)) if data and not write else '')
    status, body = client.request(path, 'POST' if write else 'GET', data if write else None)
    if status != expected:
        raise AssertionError(f'{method}: expected {expected}, got {status}: {body.decode(errors="replace")[:1800]}')
    return json.loads(body).get('message') if status == 200 else None


def detail(client, name): return call(client, 'detail', {'name': name})


def action(client, method, name, **data):
    return call(client, method, {'name': name, 'expected_revision': detail(client, name)['revision'],
                                'request_id': uid(), **data}, True)


def payload(kind='成套', collaborator=TECH):
    return {'title': 'DEMO F1 验收 ' + uid()[:8], 'business_type': kind,
            'customer_name': 'DEMO 虚构客户', 'department': 'SALES', 'collaborator': collaborator,
            'expected_date': '', 'notes': '仅用于软件验收，不是真实订单。',
            'items': [{'product_name': 'DEMO 柜体', 'quantity': 2, 'unit': '台', 'specification': '虚构规格'}]}


def upload(client, name, content, document='', filename='demo.txt', request_id=None, revision=None, expected=200):
    data = {'name': name, 'expected_revision': revision or detail(client, name)['revision'],
            'request_id': request_id or uid(), 'title': 'DEMO 需求原件', 'document': document,
            'change_note': '虚构测试版本'}
    boundary = 'jn' + uuid.uuid4().hex
    chunks = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in data.items()]
    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + b'\r\n')
    chunks.append(f'--{boundary}--\r\n'.encode())
    status, body = client.request(PREFIX + 'upload', 'POST', b''.join(chunks), 'multipart/form-data; boundary=' + boundary)
    if status != expected:
        raise AssertionError(f'upload: expected {expected}, got {status}: {body.decode(errors="replace")[:1800]}')
    return json.loads(body)['message'] if status == 200 else None


def download(client, kind, name):
    return client.request(PREFIX + 'download?' + urlencode({'kind': kind, 'name': name}))


def file_info(admin, revision):
    row = admin.json(resource('JN File Revision', revision))['data']
    return admin.json(resource('File', row['file']))['data']


def task_action(client, name, task, operation, reply=''):
    return action(client, 'task_action', name, task_name=task, action=operation, reply=reply)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--prepare-restart', action='store_true')
    modes.add_argument('--verify-restart', action='store_true')
    args = parser.parse_args()
    env = read_env()
    base = 'http://127.0.0.1:' + env['HTTP_PORT']
    guest = Client(base)
    verify(guest.request(PREFIX + 'bootstrap')[0] in (401, 403), 'Guest cannot enter workbench APIs')
    sales, tech, admin = Client(base), Client(base), Client(base)
    for client, user, password in ((sales, SALES, env['DEMO_PASSWORD']), (tech, TECH, env['DEMO_PASSWORD']), (admin, 'Administrator', env['ADMIN_PASSWORD'])):
        client.login(user, password)
    state = call(sales, 'bootstrap')
    verify(state['can_create'] and not call(tech, 'bootstrap')['can_create'] and state['ai_mode'] == 'simulation',
           'Server distinguishes sales and technical roles; AI is labelled simulation')
    path = ROOT / '.local/f1-restart-probe.json'
    if args.verify_restart:
        snapshot = json.loads(path.read_text(encoding='utf-8'))
        doc = detail(sales, snapshot['name'])
        verify(doc['revision'] == snapshot['revision'] and doc['items'] == snapshot['items'], 'Inquiry and stable product identifiers survive restart')
        verify(doc['tasks'][0]['status'] == '待确认' and doc['tasks'][0]['reply'] == snapshot['reply'], 'Human reply awaiting confirmation survives restart')
        verify(doc['documents'] == snapshot['documents'] and len(doc['activities']) == snapshot['activity_count'], 'All file versions and audit entries survive restart')
        for row in snapshot['files']:
            status, content = download(tech, 'revision', row['name'])
            verify(status == 200 and hashlib.sha256(content).hexdigest() == row['sha256'], 'Original file SHA-256 survives restart: ' + row['name'])
        replay = call(sales, 'create_inquiry', snapshot['create_command'], True)
        verify(replay['name'] == doc['name'], 'Idempotency receipt survives restart without a duplicate inquiry')
        verify(len(call(sales, 'inquiries', {'q': 'DEMO-INQ-CT-001'})['rows']) == 1 and
               len(call(sales, 'inquiries', {'q': 'DEMO-INQ-BJ-001'})['rows']) == 1, 'Repeated initialization keeps exactly one seed of each type')
        task_action(sales, doc['name'], doc['tasks'][0]['name'], 'confirm')
        action(sales, 'change_status', doc['name'], status='已归档')
        snapshot['verified_at'] = datetime.now().astimezone().isoformat()
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
    else:
        if args.prepare_restart and path.exists() and not json.loads(path.read_text(encoding='utf-8')).get('verified_at'):
            raise RuntimeError('An unfinished restart probe exists; verify it before starting another.')
        private_payload = payload(collaborator='')
        private = call(sales, 'create_inquiry', {'data': private_payload, 'request_id': uid()}, True)['name']
        call(tech, 'create_inquiry', {'data': payload(), 'request_id': uid()}, True, 403)
        call(tech, 'detail', {'name': private}, expected=403)
        verify(tech.request(resource('JN Inquiry', private))[0] == 403 and
               call(tech, 'inquiries', {'q': private})['total'] == 0 and
               tech.json(resource('JN Inquiry') + '?' + urlencode({'filters': json.dumps({'name': private})}))['data'] == [],
               'Unassigned technical account cannot read private inquiry through detail, REST or list/count')
        private_file = upload(sales, private, ('private fictional ' + uid()).encode())
        private_info = file_info(admin, private_file['revision'])
        verify(tech.request(private_info['file_url'])[0] == 403 and guest.request(private_info['file_url'])[0] in (401, 403),
               'Direct private-file URL rejects guests and unrelated users')
        verify(tech.json(resource('File') + '?' + urlencode({'filters': json.dumps({'name': private_info['name']})}))['data'] == [],
               'Unrelated user cannot enumerate private file metadata through generic File listing')
        for dt, rowname in [('JN Document', private_file['document']), ('JN File Revision', private_file['revision'])]:
            verify(tech.request(resource(dt, rowname))[0] == 403, 'Related object REST access inherits inquiry boundary: ' + dt)
        shared = []
        for kind in ('成套', '钣金'):
            create_command = {'data': payload(kind), 'request_id': uid()}
            made = call(sales, 'create_inquiry', create_command, True)
            name = made['name']; shared.append(name)
            verify(call(sales, 'create_inquiry', create_command, True) == made, kind + ': request retry returns the same inquiry')
            changed_command = {**create_command, 'data': {**create_command['data'], 'title': 'DEMO changed retry'}}
            call(sales, 'create_inquiry', changed_command, True, 409)
            doc = detail(tech, name)
            verify(doc['business_type'] == kind and len(doc['items']) == 1 and not doc['can_edit'], kind + ': structured record and product relation are readable to assigned collaborator')
            values = {k: doc[k] for k in FIELDS}
            values['notes'] = 'DEMO updated specification'
            call(tech, 'update_inquiry', {'name': name, 'expected_revision': doc['revision'], 'data': values, 'request_id': uid()}, True, 403)
            action(sales, 'update_inquiry', name, data=values)
            call(sales, 'update_inquiry', {'name': name, 'expected_revision': doc['revision'], 'data': values, 'request_id': uid()}, True, 409)
            verify(detail(sales, name)['notes'] == values['notes'], kind + ': stale edits are rejected without overwriting saved content')
            verify(admin.request(resource('JN Inquiry', name), 'PUT', {'title': 'Forbidden bypass'})[0] == 403,
                   kind + ': even generic administrator REST writes cannot bypass the service')
            token, rev = uid(), detail(sales, name)['revision']
            content1 = ('DEMO first original ' + uid()).encode()
            filename = 'DEMO-需求资料.txt'
            v1 = upload(tech, name, content1, filename=filename, request_id=token, revision=rev)
            verify(upload(tech, name, content1, filename=filename, request_id=token, revision=rev) == v1, kind + ': upload retry creates no duplicate version')
            content2 = content1 + b'\nDEMO revision two'
            v2 = upload(sales, name, content2, document=v1['document'])
            duplicate = upload(sales, name, content2, document=v1['document'])
            verify(v2['version'] == 2 and duplicate['duplicate'] and duplicate['revision'] == v2['revision'], kind + ': changed content creates V2; identical content is reused')
            verify(download(sales, 'revision', v1['revision']) == (200, content1), kind + ': V1 remains byte-identical after V2')
            with sales.opener.open(base + PREFIX + 'download?' + urlencode({'kind': 'revision', 'name': v1['revision']})) as response:
                disposition = response.headers['Content-Disposition']
                verify(disposition.startswith("attachment; filename*=UTF-8''") and
                       unquote(disposition.split("''", 1)[1]) == filename and response.read() == content1,
                       kind + ': Chinese download filename and original bytes round trip correctly')
            upload(sales, name, b'forbidden cross-parent', document=private_file['document'], expected=403)
            upload(sales, name, b'<script>not accepted</script>', filename='demo.html', expected=417)
            verify(len(detail(sales, name)['documents'][0]['versions']) == 2, kind + ': invalid file and cross-inquiry write roll back completely')
            info = file_info(admin, v1['revision'])
            for change in ({'is_private': 0}, {'attached_to_doctype': '', 'attached_to_name': ''}):
                verify(admin.request(resource('File', info['name']), 'PUT', change)[0] == 403, 'Managed original cannot be made public or detached')
            verify(admin.request(resource('File', info['name']), 'DELETE')[0] == 403 and download(tech, 'revision', v1['revision'])[1] == content1,
                   'Managed original cannot be deleted, including by generic administrator REST')
            share_status, _ = admin.request('/api/method/frappe.share.add', 'POST', {'doctype': 'JN Inquiry', 'name': name, 'user': TECH, 'read': 1})
            verify(share_status == 403, 'Generic sharing cannot bypass inquiry membership')
            task = action(sales, 'create_task', name, title='DEMO 核对规格', description='请核对虚构产品', assigned_to=TECH)['name']
            call(sales, 'task_action', {'name': name, 'expected_revision': detail(sales, name)['revision'], 'task_name': task, 'action': 'reply', 'reply': 'wrong person', 'request_id': uid()}, True, 403)
            task_action(tech, name, task, 'reply', 'DEMO 首次回复')
            call(tech, 'task_action', {'name': name, 'expected_revision': detail(tech, name)['revision'], 'task_name': task, 'action': 'confirm', 'reply': '', 'request_id': uid()}, True, 403)
            task_action(sales, name, task, 'return', 'DEMO 需要补充尺寸')
            reply = 'DEMO 已补充尺寸，等待负责人确认。'
            task_action(tech, name, task, 'reply', reply)
            task_action(sales, name, task, 'hold', 'DEMO 等待内部确认')
            verify(task_action(sales, name, task, 'resume')['status'] == '待确认', kind + ': assign/reply/return/hold/resume preserves the pending-confirmation state')
            call(sales, 'change_status', {'name': name, 'expected_revision': detail(sales, name)['revision'], 'status': '已归档', 'request_id': uid()}, True, 409)
            values = {k: detail(sales, name)[k] for k in FIELDS}; values['collaborator'] = ''
            call(sales, 'update_inquiry', {'name': name, 'expected_revision': detail(sales, name)['revision'], 'data': values, 'request_id': uid()}, True, 409)
            verify(detail(sales, name)['tasks'][0]['status'] == '待确认', kind + ': unfinished work blocks archive and collaborator removal')
            exported = action(sales, 'export_bundle', name)
            status, bundle = download(sales, 'export', exported['name'])
            with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                saved = json.loads(archive.read('inquiry.json'))
                verify(status == 200 and hashlib.sha256(bundle).hexdigest() == exported['sha256'] and len(manifest['files']) == 2 and
                       saved['tasks'][0]['status'] == '待确认' and all(hashlib.sha256(archive.read(f['path'])).hexdigest() == f['sha256'] for f in manifest['files']),
                       kind + ': downloadable ZIP contains the actual snapshot, both originals and matching hash manifest')
            if args.prepare_restart and kind == '钣金':
                doc = detail(sales, name)
                path.write_text(json.dumps({'name': name, 'revision': doc['revision'], 'items': doc['items'],
                    'documents': doc['documents'], 'reply': reply, 'activity_count': len(doc['activities']),
                    'files': doc['documents'][0]['versions'], 'create_command': create_command}, ensure_ascii=False, indent=2), encoding='utf-8')
            else:
                task_action(sales, name, task, 'confirm')
                values = {k: detail(sales, name)[k] for k in FIELDS}; values['collaborator'] = ''
                action(sales, 'update_inquiry', name, data=values)
                verify(tech.request(quote(info['file_url'], safe='/'))[0] == 403 and download(tech, 'revision', v1['revision'])[0] == 403 and
                       download(tech, 'export', exported['name'])[0] == 403 and
                       tech.json(resource('File') + '?' + urlencode({'filters': json.dumps({'name': info['name']})}))['data'] == [],
                       kind + ': revoking collaborator removes access to their own uploads and existing exports')
                action(sales, 'change_status', name, status='已归档')
                action(sales, 'change_status', name, status='协作中')
                verify(detail(sales, name)['status'] == '协作中', kind + ': archive can be restored without losing versions')
                action(sales, 'change_status', name, status='已归档')
        # Independent authenticated sessions exercise actual database serialization.
        sessions = [Client(base), Client(base)]
        for session in sessions: session.login(SALES, env['DEMO_PASSWORD'])
        concurrent = {'data': payload(), 'request_id': uid()}
        with ThreadPoolExecutor(max_workers=2) as pool:
            answers = list(pool.map(lambda c: call(c, 'create_inquiry', concurrent, True), sessions))
        verify(answers[0] == answers[1] and call(sales, 'inquiries', {'q': concurrent['data']['title']})['total'] == 1,
               'Concurrent duplicate requests commit exactly one inquiry')
        name = answers[0]['name']; doc = detail(sales, name)
        updates = [{'name': name, 'expected_revision': doc['revision'], 'request_id': uid(),
                    'data': {**{k: doc[k] for k in FIELDS}, 'notes': 'DEMO concurrent ' + str(i)}} for i in range(2)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda pair: pair[0].request(PREFIX + 'update_inquiry', 'POST', pair[1])[0], zip(sessions, updates)))
        verify(sorted(statuses) == [200, 409] and detail(sales, name)['revision'] == doc['revision'] + 1,
               'Concurrent different edits allow one winner and reject the stale writer')
        for _ in range(2):
            upload(sales, name, base64.b64encode(os.urandom(6 * 1024 * 1024)), filename='demo-random-text.txt')
        large = action(sales, 'export_bundle', name)
        code, content = download(sales, 'export', large['name'])
        verify(code == 200 and len(content) > 10 * 1024 * 1024 and hashlib.sha256(content).hexdigest() == large['sha256'],
               'Server-generated multi-file ZIP can exceed the individual 10 MB upload limit')
        action(sales, 'change_status', name, status='已归档')
        action(sales, 'change_status', private, status='已归档')
    out = ROOT / '.local/acceptance'; out.mkdir(parents=True, exist_ok=True)
    mode = 'restart' if args.verify_restart else 'prepare' if args.prepare_restart else 'smoke'
    (out / f'f1-{mode}.json').write_text(json.dumps({'checked_at': datetime.now().astimezone().isoformat(),
          'passed': len(RESULTS), 'checks': RESULTS}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'All {len(RESULTS)} workbench checks passed: .local/acceptance/f1-{mode}.json')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
    main()
