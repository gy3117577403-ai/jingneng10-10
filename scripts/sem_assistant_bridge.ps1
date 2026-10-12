param([ValidateSet('Start','Status','Stop')][string]$Action='Start')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath=Join-Path $projectRoot 'scripts/chatgpt-plan-check/server.mjs'
$reportPath=Join-Path $projectRoot '.local/acceptance/chatgpt-plan-check'
$runtimePath=Join-Path $reportPath 'runtime.json'
$running=$null
if(Test-Path -LiteralPath $runtimePath){
    $runtime=Get-Content -Raw -Encoding UTF8 -LiteralPath $runtimePath | ConvertFrom-Json
    $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$runtime.pid)" -ErrorAction SilentlyContinue
    if($candidate -and $candidate.Name -eq 'node.exe' -and $candidate.CommandLine.Contains($serverPath) -and $candidate.CommandLine.Contains('--erp')){$running=$candidate}
}
if($Action -eq 'Status'){
    if($running){Write-Output "资料助手连接正在运行；本机授权页：$($runtime.url)"}else{Write-Output '资料助手连接尚未启动。'}
    exit
}
if($Action -eq 'Stop'){
    if($running){Stop-Process -Id $running.ProcessId;Write-Output '资料助手连接已停止；套餐授权已保留。'}
    exit
}
if($running){Write-Output '资料助手连接已经运行，未重复启动。';exit}
if(!(Test-Path -LiteralPath (Join-Path $projectRoot '.local/sem/assistant-bridge/binding.json'))){throw '请先绑定软件账号：node scripts/chatgpt-plan-check/server.mjs --setup-owner <用户编号>'}
New-Item -ItemType Directory -Path $reportPath -Force | Out-Null
$nodePath=(Get-Command node.exe).Source
Start-Process -FilePath $nodePath -ArgumentList @(('"'+$serverPath+'"'),'--erp') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $reportPath 'bridge.out.log') -RedirectStandardError (Join-Path $reportPath 'bridge.err.log') | Out-Null
Write-Output '已启动资料助手连接；请在软件的查询设置中核对连接状态。'
