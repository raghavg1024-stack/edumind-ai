param([string]$PythonPath = '',[switch]$KeepAlive)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scratch = (Resolve-Path (Join-Path $project '../../work')).Path
$node = (Get-Command node).Source
$processes = @{}
function Listening([int]$port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
if (-not (Listening 8787)) {
 if (-not $PythonPath) { $PythonPath = Join-Path $scratch 'speech-venv/Scripts/python.exe' }
 if (-not (Test-Path -LiteralPath $PythonPath)) { throw 'Prepare a Python 3.11 environment using worker/speech-requirements.txt first.' }
 $env:WHISPER_CACHE = Join-Path $scratch 'whisper-models'
 $env:HF_HOME = Join-Path $scratch 'huggingface-cache'
 $speech = Start-Process -FilePath $PythonPath -ArgumentList 'worker/speech_api.py' -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $scratch 'speech.stdout.log') -RedirectStandardError (Join-Path $scratch 'speech.stderr.log')
 $processes.speech = $speech.Id
}
if (-not (Listening 3000)) {
 $web = Start-Process -FilePath $node -ArgumentList 'node_modules/next/dist/bin/next start --port 3000' -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $scratch 'edumind.stdout.log') -RedirectStandardError (Join-Path $scratch 'edumind.stderr.log')
 $processes.web = $web.Id
}
$existingWorker = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'worker/video-worker.ts' } | Select-Object -First 1
if ($existingWorker) { $processes.worker = $existingWorker.ProcessId } else {
 $worker = Start-Process -FilePath $node -ArgumentList '--env-file=.env.local --import tsx worker/video-worker.ts' -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $scratch 'worker.stdout.log') -RedirectStandardError (Join-Path $scratch 'worker.stderr.log')
 $processes.worker = $worker.Id
}
$processes | ConvertTo-Json | Set-Content (Join-Path $scratch 'classroom-processes.json')
Write-Output 'Started classroom services in the background. App: http://localhost:3000'
if ($KeepAlive) { Wait-Process -Id @($processes.Values) }
