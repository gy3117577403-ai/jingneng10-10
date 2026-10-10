"""Live UI-service regression: scoped inbox, full pagination, sort and display names.

Uses fictional DEMO records and archives them after successful verification.
No business originals or external model calls.
"""
import json
import hashlib
import re
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from dev import ROOT, read_env
from smoke import Client, check
from smoke_workbench import call, detail, action, payload, task_action, upload, uid, SALES, TECH
from smoke_ai import start, wait, review


def main():
    env = read_env()
    base = 'http://127.0.0.1:' + env['HTTP_PORT']
    sales, tech, admin, guest = [Client(base) for _ in range(4)]
    results = []
    def verify(condition, label): check(condition, label, results)
    def inbox(client, kind='all', page=1): return call(client, 'work_items', {'kind': kind, 'page': page})
    def create(client, title, collaborator='', date=''):
        data = payload(collaborator=collaborator)
        data.update(title=title, expected_date=date)
        return call(client, 'create_inquiry', {'data': data, 'request_id': uid()}, True)['name']
    for client, user, password in [(sales, SALES, env['DEMO_PASSWORD']), (tech, TECH, env['DEMO_PASSWORD']), (admin, 'Administrator', env['ADMIN_PASSWORD'])]:
        client.login(user, password)
    for round_number in range(3):
        barrier = Barrier(2)
        def sign_in(_):
            client = Client(base)
            barrier.wait(timeout=10)
            code, _ = client.request('/api/method/login', 'POST', {'usr': SALES, 'pwd': env['DEMO_PASSWORD']})
            return code, client
        with ThreadPoolExecutor(max_workers=2) as pool:
            attempts = list(pool.map(sign_in, range(2)))
        verify(all(code == 200 for code, _ in attempts),
               f'Concurrent same-account sign-ins complete without metadata races, round {round_number + 1}: {[code for code, _ in attempts]}')
        verify(all(client.json('/api/method/frappe.auth.get_logged_user')['message'] == SALES for _, client in attempts),
               f'Both concurrent sessions are authenticated, round {round_number + 1}')
    invalid = Client(base)
    code, _ = invalid.request('/api/method/login', 'POST', {'usr': SALES, 'pwd': 'wrong-' + uid()})
    verify(code in (401, 403) and invalid.request('/api/method/jingneng.api.workbench.work_items')[0] in (401, 403),
           'Invalid password remains rejected and cannot create an authenticated session')
    verify(guest.request('/api/method/jingneng.api.workbench.work_items')[0] in (401, 403), 'Inbox rejects unauthenticated access')
    call(sales, 'work_items', {'kind': 'unknown'}, expected=417)
    call(sales, 'work_items', {'page': 'invalid'}, expected=417)
    call(sales, 'inquiries', {'sort': 'modified desc; DROP TABLE x'}, expected=417)
    verify(True, 'Inbox kind/page and inquiry sort are allowlisted')
    baseline = {who: inbox(client)['counts'] for who, client in [('sales', sales), ('tech', tech)]}
    prefix = 'DEMO JN-0005 ' + uid()[:8] + ' '
    private = create(sales, prefix + 'B 私有', date='2026-12-02')
    shared = create(admin, prefix + 'A 协作', TECH, '2026-12-01')
    private_tasks = []
    for i in range(31):
        private_tasks.append(action(sales, 'create_task', private, title=f'DEMO 分页任务 {i+1:02}', description='仅用于分页与权限验收', assigned_to=SALES)['name'])
    other = action(admin, 'create_task', shared, title='DEMO 技术回复', description='仅用于角色验收', assigned_to=TECH)['name']
    current = inbox(sales)
    verify(current['counts']['reply'] == baseline['sales']['reply'] + 31 and current['total'] == baseline['sales']['all'] + 31, 'Inbox total and reply count include all 31 tasks, not just first page')
    pages = [inbox(sales, 'reply', n) for n in range(1, (current['counts']['reply'] + 29)//30 + 1)]
    names = [row['name'] for page in pages for row in page['rows']]
    verify(len(pages[0]['rows']) == 30 and len(names) == len(set(names)) and set(private_tasks).issubset(names), 'Inbox pagination has 30 rows per page and no missing or duplicate tasks')
    verify(other not in names and all(row['inquiry'] != shared for row in current['rows']), 'Sales inbox and counts exclude an unrelated inquiry')
    technical = inbox(tech)
    verify(technical['counts']['reply'] == baseline['tech']['reply'] + 1 and all(row['inquiry'] != private for row in technical['rows']), 'Technical inbox excludes private records and includes assigned shared work')
    call(tech, 'detail', {'name': private}, expected=403)
    verify(True, 'Inbox metadata cannot bypass inquiry access')
    task_action(sales, private, private_tasks[0], 'hold', 'DEMO 等待补充')
    verify(inbox(sales, 'held')['total'] == baseline['sales']['held'] + 1 and inbox(sales, 'reply')['total'] == baseline['sales']['reply'] + 30, 'Held tasks move between categories without changing total')
    task_action(sales, private, private_tasks[0], 'resume')
    task_action(tech, shared, other, 'reply', 'DEMO 已核对')
    verify(inbox(tech, 'reply')['total'] == baseline['tech']['reply'] and any(row['name'] == other for row in inbox(admin, 'confirm')['rows']), 'Technical reply leaves assignee inbox and reaches owner confirmation')
    task_action(admin, shared, other, 'confirm')
    verify(not any(row['name'] == other for row in inbox(admin)['rows']), 'Completed tasks leave actionable inbox')
    own = call(sales, 'inquiries', {'q': prefix, 'scope': 'mine', 'status': ''})
    collaboration = call(tech, 'inquiries', {'q': prefix, 'scope': 'collaborating'})
    verify(own['total'] == 1 and own['rows'][0]['name'] == private and collaboration['total'] == 1 and collaboration['rows'][0]['name'] == shared, 'Responsibility filters are permission-aware on complete query')
    sorted_rows = call(admin, 'inquiries', {'q': prefix, 'sort': 'delivery'})['rows']
    verify([r['name'] for r in sorted_rows] == [shared, private], 'Delivery sort is applied server-side')
    verify(sorted_rows[0]['collaborator_name'] == '演示技术' and sorted_rows[1]['responsible_name'] == '演示销售', 'Authorized rows contain display names without exposing unrelated users')
    uploaded = upload(sales, private, 'DEMO 虚构来源\n客户名称：DEMO 核对客户\n'.encode())
    run, _ = start(sales, private, uploaded['revision'])
    wait(sales, run['name'])
    verify(inbox(sales, 'ai')['total'] == baseline['sales']['ai'] + 1, 'Pending AI review is counted for inquiry owner')
    record = detail(sales, private)
    action(sales, 'update_inquiry', private, data={**{k: record[k] for k in payload()}, 'notes': 'DEMO 原件之后的信息更新'})
    verify(any(r['name'] == run['name'] and r['stale'] for r in inbox(sales, 'ai')['rows']), 'Stale AI candidate is visibly marked after inquiry revision changes')
    review(sales, run['name'], decision='reject')
    verify(inbox(sales, 'ai')['total'] == baseline['sales']['ai'], 'Rejected AI review leaves inbox without changing inquiry fields')
    for task in private_tasks:
        task_action(sales, private, task, 'reply', 'DEMO 验收完成')
        task_action(sales, private, task, 'confirm')
    for client, name in [(sales, private), (admin, shared)]:
        action(client, 'change_status', name, status='已归档')
    verify(inbox(sales)['counts'] == baseline['sales'] and inbox(tech)['counts'] == baseline['tech'], 'Completed fixture cleanup restores actionable counts')
    verify(call(sales, 'inquiries', {'q': prefix})['total'] == 0 and call(sales, 'inquiries', {'q': prefix, 'status': ''})['total'] == 1, 'All-status filtering includes archived records while default hides them')
    status, page = guest.request('/signin')
    verify(status == 200 and '登录工作空间'.encode() in page and b'csrf-token' in page, 'Custom sign-in renders and includes session CSRF protection')
    for client, route in [(guest, '/signin'), (sales, '/workbench')]:
        code, html = client.request(route)
        assets = re.findall(rb'(?:href|src)="(/assets/jingneng/[^"?]+\.(?:css|js))\?v=([a-f0-9]{16})"', html)
        digest = hashlib.sha256()
        for path, version in assets:
            asset_code, body = client.request(path.decode())
            assert asset_code == 200
            digest.update(body)
        verify(code == 200 and len(assets) == (3 if route == '/signin' else 2) and
               all(version.decode() == digest.hexdigest()[:16] for _, version in assets),
               route + ': asset URLs match deployed content so fixes replace cached versions')
    destination = ROOT / '.local/acceptance/jn-0005-ui'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'api-results.json').write_text(json.dumps({'checks': results, 'fixture_inquiries': [private, shared]}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS: {len(results)} workspace checks')


if __name__ == '__main__':
    main()
