"""Exercise the live demo through HTTP, including authorization and persistence."""

import argparse
from datetime import datetime
import hashlib
import html
import http.cookiejar
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from dev import ROOT, read_env


class Client:
    def __init__(self, base):
        self.base = base
        self.csrf = ''
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, method='GET', payload=None, content_type='application/json'):
        headers = {'Accept': 'application/json', 'Content-Type': content_type}
        if self.csrf:
            headers['X-Frappe-CSRF-Token'] = self.csrf
        body = json.dumps(payload).encode() if isinstance(payload, dict) else payload
        request = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def json(self, path, method='GET', payload=None):
        status, body = self.request(path, method, payload)
        if status != 200:
            raise RuntimeError(f'{method} {path} returned HTTP {status}; inspect service logs for details.')
        return json.loads(body)

    def login(self, user, password):
        self.json('/api/method/login', 'POST', {'usr': user, 'pwd': password})
        status, page = self.request('/foundation')
        match = re.search(r'<meta name="csrf-token" content="([^"]+)"', page.decode('utf-8'))
        if status != 200 or not match:
            raise RuntimeError('Authenticated foundation page or CSRF token is unavailable.')
        self.csrf = html.unescape(match.group(1))


def resource(doctype, name=''):
    path = '/api/resource/' + urllib.parse.quote(doctype, safe='')
    return path + ('/' + urllib.parse.quote(name, safe='') if name else '')


def check(condition, label, results):
    if not condition:
        raise AssertionError(label)
    results.append(label)
    print('PASS: ' + label, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--prepare-restart', action='store_true')
    modes.add_argument('--verify-restart', action='store_true')
    args = parser.parse_args()
    env = read_env()
    base = 'http://127.0.0.1:' + env['HTTP_PORT']
    results = []
    guest = Client(base)
    status, _ = guest.request('/api/method/jingneng.api.runtime.state')
    check(status in (401, 403), 'Guest cannot read the foundation API', results)

    sales = Client(base)
    sales.login('sales.demo@example.invalid', env['DEMO_PASSWORD'])
    state = sales.json('/api/method/jingneng.api.runtime.state')['message']
    check(all(state['checks'].values()), 'Live database, cache and queue connections succeed', results)
    check(state['ai_mode'] == 'disabled', 'AI is explicitly disabled; no model calls', results)
    check(len(state['departments']) == 9, 'Nine departments are initialized once', results)
    check({item['name'] for item in state['cases']} == {'DEMO-CT-001', 'DEMO-BJ-001'},
          'Both demonstration types exist without duplicate seeds', results)
    case_path = resource('JN Demo Case', 'DEMO-CT-001')
    status, _ = sales.request(case_path, 'PUT', {'description': 'This forbidden write must not be saved.'})
    check(status == 403, 'Read-only demo user cannot modify records through REST', results)

    tech = Client(base)
    tech.login('tech.demo@example.invalid', env['DEMO_PASSWORD'])
    check(tech.json('/api/method/jingneng.api.runtime.state')['message']['user'] == 'tech.demo@example.invalid',
          'Second demonstration account can log in', results)
    task = sales.json('/api/method/jingneng.api.runtime.start_probe', 'POST', {})['message']
    status, _ = tech.request('/api/method/jingneng.api.runtime.probe_result?token=' + task['token'])
    check(status in (403, 404), 'A task probe result is restricted to its initiating user', results)
    for _ in range(30):
        result = sales.json('/api/method/jingneng.api.runtime.probe_result?token=' + task['token'])['message']
        if result['status'] == 'completed':
            break
        time.sleep(0.5)
    check(result['status'] == 'completed', 'A separate worker processes an actual queued task', results)

    admin = Client(base)
    admin.login('Administrator', env['ADMIN_PASSWORD'])
    probe_path = ROOT / '.local/restart-probe.json'
    if args.prepare_restart:
        if probe_path.exists():
            raise RuntimeError('A restart probe already exists. Verify it instead of creating duplicate test data.')
        original = admin.json(case_path)['data']['description']
        token = uuid.uuid4().hex
        marker = 'DEMO persistence probe ' + token
        admin.json(case_path, 'PUT', {'description': marker})
        content = ('Jingneng F0 private file probe ' + token + '\n').encode()
        boundary = 'jn' + token
        parts = []
        for key, value in {'is_private': '1', 'doctype': 'JN Demo Case', 'docname': 'DEMO-CT-001'}.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="jn-f0-probe.txt"\r\nContent-Type: text/plain\r\n\r\n').encode() + content + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode())
        status, response = admin.request('/api/method/upload_file', 'POST', b''.join(parts), 'multipart/form-data; boundary=' + boundary)
        check(status == 200, 'Private file uploaded and linked to the demonstration record', results)
        uploaded = json.loads(response)['message']
        snapshot = {'record': 'DEMO-CT-001', 'marker': marker, 'original_description': original,
                    'file_url': uploaded['file_url'], 'file_sha256': hashlib.sha256(content).hexdigest(),
                    'case_names': sorted(item['name'] for item in state['cases']),
                    'department_names': sorted(item['name'] for item in state['departments'])}
        probe_path.parent.mkdir(exist_ok=True)
        probe_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
        check(snapshot['file_url'].startswith('/private/files/'), 'Probe file is stored as private', results)
        status, _ = guest.request(snapshot['file_url'])
        check(status in (401, 403), 'Guest cannot download the private file', results)
        print('Now rerun initialization, restart the stack, then run --verify-restart.', flush=True)

    if args.verify_restart:
        snapshot = json.loads(probe_path.read_text(encoding='utf-8'))
        document = admin.json(case_path)['data']
        check(document['description'] == snapshot['marker'], 'Edited record survives reinitialization and full service restart', results)
        check(sorted(item['name'] for item in state['cases']) == snapshot['case_names'] and
              sorted(item['name'] for item in state['departments']) == snapshot['department_names'],
              'Reinitialization preserves stable identifiers and creates no duplicate data', results)
        status, content = admin.request(snapshot['file_url'])
        check(status == 200 and hashlib.sha256(content).hexdigest() == snapshot['file_sha256'],
              'Private attachment survives restart with identical SHA-256', results)
        status, _ = guest.request(snapshot['file_url'])
        check(status in (401, 403), 'Private file remains inaccessible to guests after restart', results)
        admin.json(case_path, 'PUT', {'description': snapshot['original_description']})
        snapshot['verified_at'] = datetime.now().astimezone().isoformat()
        probe_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')

    output = ROOT / '.local/acceptance'
    output.mkdir(parents=True, exist_ok=True)
    mode = 'restart' if args.verify_restart else 'prepare' if args.prepare_restart else 'smoke'
    report = {'checked_at': datetime.now().astimezone().isoformat(), 'mode': mode, 'base_url': base,
              'passed': len(results), 'checks': results, 'frappe_version': state['frappe_version']}
    (output / f'{mode}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'All {len(results)} checks passed. Evidence: .local/acceptance/{mode}.json')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except (AssertionError, RuntimeError, OSError, KeyError, ValueError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
