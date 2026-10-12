import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ProbeError } from './core.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
function protect(mode, input = '', directory) {
  if (process.platform !== 'win32') return Promise.reject(new ProbeError('windows_required'));
  return new Promise((resolve, reject) => {
    const script = path.join(here, 'protected-store.ps1');
    const args = ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode];
    if (directory) args.push('-Directory',directory);
    const child = spawn('powershell.exe', args, { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let out = '', diagnostic = '';
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on('data',data=>{out+=data.toString(); if(out.length>2_000_000)child.kill();});
    child.stderr.on('data',data=>{if(diagnostic.length<500)diagnostic+=data.toString();});
    child.on('error',()=>{clearTimeout(timer);reject(new ProbeError('protected_storage_failed'));});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out.trim());else {
      const failure=new ProbeError('protected_storage_failed');failure.stage=mode;failure.exitCode=code;
      failure.exceptionType=diagnostic.match(/Windows protected storage failed: [a-z]+ \/ ([A-Za-z0-9_.]+)/)?.[1]||'unavailable';
      reject(failure);
    }});
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}
export class ProtectedStore {
  constructor(directory) { this.directory=directory; this.file=path.join(directory,'connection.dpapi'); }
  async init() {
    await mkdir(this.directory,{recursive:true});
    if ((await lstat(this.directory)).isSymbolicLink()) throw new ProbeError('unsafe_storage_path');
    await protect('init','',this.directory);
  }
  async load() {
    try {
      if ((await lstat(this.file)).isSymbolicLink()) throw new ProbeError('unsafe_storage_path');
      const cipher=await readFile(this.file,'utf8');
      const plain=await protect('unprotect',cipher);
      return JSON.parse(Buffer.from(plain,'base64').toString('utf8'));
    } catch(error) { if(error.code==='ENOENT')return null; throw new ProbeError('protected_storage_unreadable'); }
  }
  async save(value) {
    const cipher=await protect('protect',Buffer.from(JSON.stringify(value)).toString('base64'));
    const temp=path.join(this.directory,`${randomUUID()}.tmp`);
    await writeFile(temp,cipher,{flag:'wx',mode:0o600});
    await rename(temp,this.file);
  }
}
