"""Idempotent local site creation. Never reinstall a site or reset its passwords."""

import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path('/home/frappe/frappe-bench')
site = os.environ.get('SITE_NAME', 'jingneng.localhost')
if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,80}', site):
    raise SystemExit('Invalid SITE_NAME')
for key in ('DB_ROOT_PASSWORD', 'ADMIN_PASSWORD', 'DEMO_PASSWORD'):
    if len(os.environ.get(key, '')) < 16:
        raise SystemExit(f'{key} must contain at least 16 characters; generate local configuration first.')


def run(*args):
    # Avoid CalledProcessError: it would include password arguments in its repr.
    result = subprocess.run(['bench', *args], cwd=ROOT, check=False)
    if result.returncode:
        raise SystemExit(f'Initialization step failed (exit {result.returncode}); site and volumes preserved.')


config_path = ROOT / 'sites/common_site_config.json'
config = json.loads(config_path.read_text()) if config_path.exists() else {}
config.update({
    'db_host': 'db', 'db_port': 3306,
    'redis_cache': 'redis://redis-cache:6379',
    'redis_queue': 'redis://redis-queue:6379',
    'redis_socketio': 'redis://redis-queue:6379',
    'socketio_port': 9000, 'default_site': site,
    'serve_default_site': True, 'developer_mode': 0,
    'scheduler_tick_interval': 30,
    'chromium_path': '/usr/bin/chromium-headless-shell',
})
config_path.write_text(json.dumps(config, indent=2) + '\n')
(ROOT / 'sites/apps.txt').write_text('frappe\njingneng\n')
if not (ROOT / 'sites' / site / 'site_config.json').exists():
    run('new-site', site, '--db-type', 'mariadb', '--db-host', 'db',
        '--db-root-username', 'root', '--db-root-password', os.environ['DB_ROOT_PASSWORD'],
        '--admin-password', os.environ['ADMIN_PASSWORD'], '--mariadb-user-host-login-scope', '%')
else:
    print('Existing site found; preserving data and existing passwords.', flush=True)

# Install only if needed; do not turn an initialization retry into a reinstall.
probe = subprocess.run(['bench', '--site', site, 'list-apps', '--format', 'json'],
                       cwd=ROOT, capture_output=True, text=True, check=False)
if probe.returncode:
    raise SystemExit('Cannot read existing site app list; initialization stopped without resetting data.')
if 'jingneng' not in json.loads(probe.stdout).get(site, []):
    run('--site', site, 'install-app', 'jingneng')
run('--site', site, 'execute', 'jingneng.setup.ensure_role')
# The persistent cache may still contain the old application's module map.
# Invalidate it in a separate process before migration loads new module folders.
run('--site', site, 'clear-cache')
run('--site', site, 'migrate')
run('--site', site, 'execute', 'jingneng.setup.seed_demo')
run('--site', site, 'enable-scheduler')
run('--site', site, 'set-config', 'host_name', 'http://127.0.0.1:' + os.environ.get('HTTP_PORT', '8088'))
print('Jingneng demonstration site initialized. Credentials remain in local configuration.', flush=True)
