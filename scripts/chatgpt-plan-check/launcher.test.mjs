import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Windows PowerShell launches the Chinese script from a path with spaces and Chinese characters', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jn-连接测试 '));
  try {
    const scripts = path.join(root, 'scripts');
    await mkdir(scripts);
    const launcher = path.join(scripts, 'sem_assistant_bridge.ps1');
    await copyFile(new URL('../sem_assistant_bridge.ps1', import.meta.url), launcher);
    // Windows PowerShell 5.1 reads a BOM-less UTF-8 script as ANSI. Exercise the
    // documented entry point, rather than parsing it with PowerShell 7 or Node.
    const result = spawnSync('powershell.exe', ['-NoProfile', '-File', launcher, '-Action', 'Status'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /资料助手连接尚未启动。/u);
    const stopped = spawnSync('powershell.exe', ['-NoProfile', '-File', launcher, '-Action', 'Stop'], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(stopped.status, 0, stopped.stderr);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('jn-连接测试 '));
    await rm(root, { recursive: true, force: true });
  }
});
