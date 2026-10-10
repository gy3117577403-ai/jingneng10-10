"""Manage the isolated JN-0012 SEM demo. Secrets and backups stay in .local/."""
import argparse
import base64
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local' / 'sem'
ENV = LOCAL / 'compose.env'


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def compose(*args, project=None, **kwargs):
    command = ['docker', 'compose', '--env-file', str(ENV), '-f', 'compose.sem.yaml']
    if project:
        command += ['-p', project]
    return run(command + list(args), **kwargs)


def init_env():
    LOCAL.mkdir(parents=True, exist_ok=True)
    expected = [ENV, LOCAL / 'runtime.env', LOCAL / 'credentials.txt']
    if all(p.exists() for p in expected):
        print('Existing SEM configuration preserved.')
        return
    if any(p.exists() for p in expected):
        raise SystemExit('Incomplete configuration: recover the missing files; secrets were not regenerated.')
    password, db_password, root_password = [secrets.token_urlsafe(24) for _ in range(3)]
    ENV.write_text(f'SEM_PROJECT=jingneng-sem\nSEM_HTTP_PORT=8090\nSEM_DB_PASSWORD={db_password}\nSEM_DB_ROOT_PASSWORD={root_password}\n', encoding='utf-8')
    values = {
        'APP_NAME': '"京能制造 · 演示"', 'APP_ENV': 'production', 'APP_DEBUG': 'false',
        'APP_KEY': 'base64:' + base64.b64encode(secrets.token_bytes(32)).decode(),
        'APP_URL': 'http://127.0.0.1:8090', 'APP_TIMEZONE': 'Asia/Shanghai',
        'APP_LOCALE': 'zh-CN', 'LOCALE_ACCEPT_LANGUAGE': 'false',
        'APP_COMMERCIAL': 'false', 'REGISTRATION_ENABLED': 'false',
        'DB_CONNECTION': 'mysql', 'DB_HOST': 'db', 'DB_PORT': '3306',
        'DB_DATABASE': 'sem', 'DB_USERNAME': 'sem', 'DB_PASSWORD': db_password,
        'REDIS_CLIENT': 'predis', 'REDIS_HOST': 'redis', 'REDIS_PORT': '6379',
        'CACHE_DRIVER': 'redis', 'CACHE_STORE': 'redis', 'SESSION_DRIVER': 'redis',
        'SESSION_COOKIE': 'jingneng_sem_session', 'QUEUE_CONNECTION': 'redis',
        'BROADCAST_DRIVER': 'log', 'BROADCAST_CONNECTION': 'log',
        'MAIL_MAILER': 'log', 'MAIL_FROM_ADDRESS': 'demo@example.invalid',
        'LOG_CHANNEL': 'stack', 'LOG_LEVEL': 'warning', 'TELESCOPE_ENABLED': 'false',
        'PULSE_ENABLED': 'false', 'NESTENGINE_ENABLED': 'false',
        'JINGNENG_DEMO_EMAIL': 'admin@jingneng.demo', 'JINGNENG_DEMO_PASSWORD': password,
    }
    (LOCAL / 'runtime.env').write_text(''.join(f'{k}={v}\n' for k, v in values.items()), encoding='utf-8')
    (LOCAL / 'credentials.txt').write_text(f'京能 ΣEM 本机演示\n入口：http://127.0.0.1:8090\n账号：admin@jingneng.demo\n密码：{password}\n仅本机配置；请勿提交到公开仓库。\n', encoding='utf-8')
    for path in expected:
        path.chmod(0o600)
    print(f'Configuration created. Credentials: {LOCAL / "credentials.txt"}')


def wait_http(url, timeout=120):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(2)
    raise RuntimeError(f'HTTP readiness failed: {url}')


def backup():
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    destination = LOCAL / 'backups' / stamp
    destination.mkdir(parents=True)
    compose('stop', 'web', 'app', 'worker', 'scheduler')
    try:
        snapshot_result = compose('run', '--rm', '-T', '--no-deps', 'app', 'php',
                                 '/opt/jingneng-sem/inspect.php', stdout=subprocess.PIPE)
        baseline = json.loads(snapshot_result.stdout)
        with (destination / 'database.sql').open('wb') as out:
            compose('exec', '-T', 'db', 'sh', '-c',
                    'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers sem', stdout=out)
        with (destination / 'storage.tar.gz').open('wb') as out:
            compose('run', '--rm', '--no-deps', '--entrypoint', 'tar', 'app', '-czf', '-', '-C', '/app/storage', '.', stdout=out)
        for filename in ['runtime.env', 'compose.env', 'credentials.txt']:
            shutil.copy2(LOCAL / filename, destination / filename)
        metadata = {
            'created_at': datetime.now().astimezone().isoformat(),
            'git_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'image': json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'jingneng/sem:jn-0012'], text=True))[0]['Id'],
            'baseline': {'counts': baseline['counts'], 'files': baseline['files'], 'locale': baseline['locale']},
            'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.iterdir() if p.is_file()},
        }
        (destination / 'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    finally:
        compose('start', 'app', 'worker', 'scheduler', 'web')
    print(f'Consistent database, uploads and configuration backup: {destination}')
    return destination


def validate_backup(source):
    source = source.resolve()
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    required = {'database.sql', 'storage.tar.gz', 'runtime.env', 'compose.env', 'credentials.txt'}
    if not required.issubset(manifest['files']):
        raise RuntimeError('Backup manifest is incomplete.')
    for name, digest in manifest['files'].items():
        path = (source / name).resolve()
        if not path.is_relative_to(source) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'Backup verification failed: {name}')
    return manifest


def import_backup(source, project=None):
    compose('up', '-d', '--wait', 'db', 'redis', project=project)
    with (source / 'database.sql').open('rb') as content:
        compose('exec', '-T', 'db', 'sh', '-c', 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" sem', project=project, stdin=content)
    with (source / 'storage.tar.gz').open('rb') as content:
        compose('run', '--rm', '-T', '--no-deps', '--entrypoint', 'tar', 'app', '-xzf', '-', '-C', '/app/storage', project=project, stdin=content)
    compose('up', '-d', '--no-build', project=project)


def restore_new(source):
    """Restore on a new machine only; refuse any existing project's containers or volumes."""
    from sem_acceptance import snapshot, Client
    source = source.resolve()
    manifest = validate_backup(source)
    if (LOCAL / 'runtime.env').read_bytes() != (source / 'runtime.env').read_bytes():
        raise RuntimeError('Copy the matching runtime.env and APP_KEY before restoring.')
    config = json.loads(compose('config', '--format', 'json', stdout=subprocess.PIPE).stdout)
    project = config['name']
    for resource in ['ps', 'volume']:
        command = ['docker', 'ps', '-aq'] if resource == 'ps' else ['docker', 'volume', 'ls', '-q']
        found = subprocess.check_output(command + ['--filter', 'label=com.docker.compose.project=' + project], text=True)
        if found.strip():
            raise RuntimeError('Existing project found; restore-new never overwrites it. Use an empty machine/project.')
    import_backup(source, project)
    wait_http(config['services']['app']['environment']['APP_URL'] + '/login')
    client = Client(config['services']['app']['environment']['APP_URL'])
    client.login()
    actual = snapshot(project)
    for field in ['counts', 'files', 'locale']:
        assert actual[field] == manifest['baseline'][field], f'Restored {field} differs'
    print('New environment restored: database rows, file hashes and login match the backup.')


def restore_check(source):
    """Restore only into a newly allocated disposable project, never the live demo."""
    from sem_acceptance import snapshot, Client
    source = source.resolve()
    manifest = validate_backup(source)
    if (LOCAL / 'runtime.env').read_bytes() != (source / 'runtime.env').read_bytes():
        raise RuntimeError('This rehearsal requires the backed-up runtime configuration and APP_KEY.')
    project = 'jingneng-sem-restore-' + datetime.now().strftime('%Y%m%d%H%M%S')
    for command in [['docker', 'ps', '-aq'], ['docker', 'volume', 'ls', '-q']]:
        prior = subprocess.check_output(command + ['--filter', 'label=com.docker.compose.project=' + project], text=True)
        if prior.strip():
            raise RuntimeError('Restore project already exists; nothing overwritten.')
    before = manifest['baseline']
    overrides = {'SEM_HTTP_PORT': '8091', 'SEM_APP_URL': 'http://127.0.0.1:8091', 'SEM_SUBNET': '10.250.21.0/24'}
    saved = {key: os.environ.get(key) for key in overrides}
    os.environ.update(overrides)
    success = False
    try:
        import_backup(source, project)
        wait_http('http://127.0.0.1:8091/login')
        client = Client('http://127.0.0.1:8091')
        client.login()
        after = snapshot(project)
        assert before['counts'] == after['counts'], 'Restored row counts differ'
        assert before['files'] == after['files'], 'Restored file hashes differ'
        assert before['locale'] == after['locale'] == 'zh-CN'
        result = {'passed': True, 'project': project, 'backup': str(source), 'counts': after['counts'],
                  'file_count': len(after['files']), 'file_hashes': after['files'], 'login': True,
                  'completed_at': datetime.now().astimezone().isoformat()}
        destination = ROOT / '.local' / 'acceptance' / 'jn-0012' / 'restore.json'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        success = True
        print(f'Isolated restore, row counts, file hashes and login verified: {destination}')
    finally:
        if success:
            compose('down', '--volumes', project=project)
        else:
            compose('stop', project=project)
            print(f'Restore failed; stopped test project retained for investigation: {project}')
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def package():
    dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)
    if dirty.strip():
        raise RuntimeError('Commit reviewed source changes before packaging so the archive has an exact revision.')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    destination = LOCAL / 'releases' / ('JN-0012-' + commit[:12] + '-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    destination.mkdir(parents=True)
    saved = backup()
    shutil.copytree(saved, destination / 'backup')
    run(['git', 'archive', '--format=zip', '-o', str(destination / 'source.zip'), 'HEAD'])
    run(['git', 'bundle', 'create', str(destination / 'history.bundle'), '--all'])
    images = ['jingneng/sem:jn-0012']
    for service in ['db', 'redis']:
        container = compose('ps', '-q', service, stdout=subprocess.PIPE).stdout.decode().strip()
        image = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', container], text=True).strip()
        tag = f'jingneng/sem-{service}:jn-0012'
        run(['docker', 'tag', image, tag])
        images.append(tag)
    run(['docker', 'save', '-o', str(destination / 'images.tar'), *images])
    readme = '''# JN-0012 本机迁移包（含私密配置，请勿公开上传）

1. 新电脑准备 Docker Desktop 的 Linux 容器环境、Git、Python 3.10+。
2. 运行 git clone <本包路径>/history.bundle <新目录>，进入新目录后执行 git checkout <本包提交号>。
   提交号见本文件末尾和 SHA256SUMS.json。使用历史仓库可继续开发并生成后续备份。
3. 把 backup 目录复制到新目录的 .local/sem/transfer；再把 backup 内的 compose.env、runtime.env、credentials.txt 复制到 .local/sem/。
4. 在新目录打开终端，运行 docker load -i <本包路径>/images.tar（路径含空格时加双引号）。
5. 在 .local/sem/compose.env 末尾加入以下两行，使用包内已校验镜像：
   SEM_DB_IMAGE=jingneng/sem-db:jn-0012
   SEM_REDIS_IMAGE=jingneng/sem-redis:jn-0012
6. 运行 python scripts/sem.py restore-new --backup .local/sem/transfer。
   已有同名容器或数据卷会被拒绝，不覆盖旧环境。首次恢复不要运行 start。
7. 打开 http://127.0.0.1:8090，用 credentials.txt 登录。
8. 检查两类报价、订单、附件和库存；旧电脑保留到新电脑核对完成。

SHA256SUMS.json 覆盖本包文件。history.bundle 保存 Git 历史，source.zip 是同一版本的备用源码快照。
后续需要推送时，将 origin 改为原 GitHub 仓库 https://github.com/gy3117577403-ai/jingneng10-10.git，核对分支后继续。
聊天、旧 Frappe 数据和企业内部原件不在此包中。新电脑实际启动仍需执行上述恢复核对。
'''
    readme += f'\n本包提交号：{commit}\n'
    (destination / 'README.md').write_text(readme, encoding='utf-8')
    checksums = {}
    for path in destination.rglob('*'):
        if path.is_file():
            with path.open('rb') as stream:
                hasher = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    hasher.update(chunk)
                digest = hasher.hexdigest()
            checksums[path.relative_to(destination).as_posix()] = digest
    (destination / 'SHA256SUMS.json').write_text(json.dumps({'commit': commit, 'files': checksums}, indent=2) + '\n', encoding='utf-8')
    print(f'Private portable package ready: {destination}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init-env', 'start', 'stop', 'status', 'backup', 'build', 'logs', 'restore-check', 'restore-new', 'package', 'test'])
    parser.add_argument('--backup', type=Path, help='Backup directory for isolated restore-check')
    args = parser.parse_args()
    if args.command in ['init-env', 'start', 'build']:
        init_env()
    if args.command == 'start':
        # Build the shared image once. Multi-service BuildKit sessions can fail
        # on Windows workspaces with non-ASCII paths.
        compose('build', 'app')
        compose('up', '-d', '--no-build')
        wait_http('http://127.0.0.1:8090/login')
        compose('ps', '-a')
        print(f'SEM ready: http://127.0.0.1:8090 | Credentials: {LOCAL / "credentials.txt"}')
    elif args.command == 'build':
        compose('build', 'app')
    elif args.command == 'stop':
        compose('stop')
    elif args.command == 'status':
        compose('ps', '-a')
    elif args.command == 'logs':
        compose('logs', '--tail', '60', 'init', 'app', 'worker', 'web')
    elif args.command == 'backup':
        backup()
    elif args.command in ['restore-check', 'restore-new']:
        if not args.backup:
            parser.error('--backup is required for restoration')
        (restore_check if args.command == 'restore-check' else restore_new)(args.backup)
    elif args.command == 'package':
        package()
    elif args.command == 'test':
        # No network and no live volumes: RefreshDatabase cannot reach the demo DB.
        test_env = LOCAL / 'test.env'
        test_env.write_text('\n'.join([
            'APP_ENV=testing', 'APP_DEBUG=false', 'APP_LOCALE=en',
            'APP_KEY=base64:' + base64.b64encode(secrets.token_bytes(32)).decode(),
            'DB_CONNECTION=sqlite', 'DB_DATABASE=:memory:', 'CACHE_DRIVER=array',
            'CACHE_STORE=array', 'SESSION_DRIVER=array', 'QUEUE_CONNECTION=sync',
            'BROADCAST_DRIVER=log', 'MAIL_MAILER=array', 'PULSE_ENABLED=false',
        ]) + '\n', encoding='utf-8')
        run(['docker', 'run', '--rm', '--network', 'none', '--env-file', str(test_env),
             '--tmpfs', '/app/storage', '--tmpfs', '/app/tests_tmp:uid=33,gid=33,mode=0770', 'jingneng/sem:jn-0012', 'php',
             'vendor/bin/phpunit', '--colors=never'])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
