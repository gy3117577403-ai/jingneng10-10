"""Local runtime commands. Python stdlib only; Docker runs application dependencies."""

import argparse
from datetime import datetime
import json
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def run(command, *, capture=False, timeout=None):
    result = subprocess.run(command, cwd=ROOT, check=False, timeout=timeout,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    if result.returncode:
        if capture:
            print(result.stderr.decode('utf-8', errors='replace'), file=sys.stderr)
        raise RuntimeError(f'Command failed (exit {result.returncode}); existing data preserved.')
    return result.stdout.decode('utf-8', errors='replace').strip() if capture else ''


def compose(*args, **kwargs):
    return run(['docker', 'compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'compose.yaml'), *args], **kwargs)


def read_env():
    path = ROOT / '.env'
    if not path.exists():
        raise RuntimeError('No local .env. Run python scripts/dev.py init-env first.')
    return dict(line.split('=', 1) for line in path.read_text(encoding='utf-8').splitlines()
                if line.strip() and not line.startswith('#') and '=' in line)


def init_env():
    if (ROOT / '.env').exists():
        print('Existing .env preserved; credentials were not regenerated.')
        return
    with socket.socket() as listener:
        try:
            listener.bind(('127.0.0.1', 8088))
        except OSError as exc:
            raise RuntimeError('Port 8088 is occupied; choose HTTP_PORT in a local .env before starting.') from exc
    values = {'COMPOSE_PROJECT_NAME': 'jingneng-dev', 'SITE_NAME': 'jingneng.localhost', 'HTTP_PORT': '8088',
              'DOCKER_SUBNET': '10.250.10.0/24',
              'DB_ROOT_PASSWORD': secrets.token_urlsafe(24), 'ADMIN_PASSWORD': secrets.token_urlsafe(24),
              'DEMO_PASSWORD': secrets.token_urlsafe(24)}
    with (ROOT / '.env').open('x', encoding='utf-8') as file:
        file.write('\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
    (ROOT / '.local').mkdir(exist_ok=True)
    with (ROOT / '.local/demo-credentials.txt').open('x', encoding='utf-8') as file:
        file.write('仅本机演示使用，禁止提交或分享此文件。\n登录：http://127.0.0.1:8088/login?redirect-to=/workbench\n\n')
        file.write('Administrator\n' + values['ADMIN_PASSWORD'] + '\n\n')
        file.write('sales.demo@example.invalid / tech.demo@example.invalid\n' + values['DEMO_PASSWORD'] + '\n')
        file.write('\n再次初始化不会重置已有账号密码；此处是首次创建凭据。\n')
    print('Generated .env and .local/demo-credentials.txt; secrets were not printed.')


def doctor():
    server = json.loads(run(['docker', 'version', '--format', '{{json .Server}}'], capture=True, timeout=15))
    if server.get('Os') != 'linux':
        raise RuntimeError('Linux containers are required.')
    print(f"Docker Engine {server['Version']} / {server['Os']}/{server['Arch']}")
    print(run(['docker', 'compose', 'version'], capture=True, timeout=15))


def wait_ready():
    url = f"http://127.0.0.1:{read_env()['HTTP_PORT']}/api/method/ping"
    for _ in range(60):
        try:
            with urllib.request.urlopen(url, timeout=3) as result:
                if result.status == 200:
                    print(url.replace('/api/method/ping', '/workbench') + ' is ready.')
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise RuntimeError('Readiness timeout; inspect docker compose logs. No volumes were deleted.')


def start(build=True):
    init_env()
    doctor()
    compose('config', '--quiet')
    if build:
        compose('build', 'backend')
    compose('up', '-d', '--no-build')
    wait_ready()


def backup():
    env = read_env()
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    destination = ROOT / '.local/backups' / stamp
    destination.mkdir(parents=True, exist_ok=False)
    # Frappe's automatic cleanup expects files, not subdirectories, inside
    # private/backups. Keep manual export batches outside that managed folder.
    container_dir = '/home/frappe/frappe-bench/sites/' + env['SITE_NAME'] + '/private/jingneng-backup-staging/' + stamp
    compose('exec', '-T', 'backend', 'bench', '--site', env['SITE_NAME'], 'backup',
            '--with-files', '--compress', '--backup-path', container_dir)
    container = compose('ps', '-q', 'backend', capture=True)
    run(['docker', 'cp', container + ':' + container_dir + '/.', str(destination)])
    import hashlib
    manifest = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in destination.iterdir() if p.is_file()}
    if not any(name.endswith('.sql.gz') for name in manifest):
        raise RuntimeError('No database dump found in the copied backup.')
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Backup saved with hash manifest: ' + str(destination))
    print('Backup creation alone does not prove recovery; restoration is a separate acceptance step.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['doctor', 'init-env', 'start', 'status', 'stop', 'restart', 'backup'])
    args = parser.parse_args()
    if args.command == 'doctor': doctor()
    elif args.command == 'init-env': init_env()
    elif args.command == 'start': start()
    elif args.command == 'status': compose('ps', '--all')
    elif args.command == 'stop': compose('stop')
    elif args.command == 'restart':
        compose('stop')
        start(build=False)
    elif args.command == 'backup': backup()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
