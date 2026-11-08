param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Sync', 'Validate', 'Train', 'Evaluate', 'Select', 'Predict', 'Reconcile', 'Status', 'Analytics')]
    [string]$Task,
    [string]$DatabasePath = $env:INVESTING_HUB_ML_DB
)

# Explicitly invoked by an operator or scheduler; this script registers no jobs.
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoPath '.venv\Scripts\python.exe'
$pipelinePath = Join-Path $PSScriptRoot 'pipeline.py'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw "Python environment missing: $pythonPath" }
if (-not $DatabasePath) { $DatabasePath = Join-Path $PSScriptRoot 'data\lifecycle.sqlite3' }
$DatabasePath = [System.IO.Path]::GetFullPath($DatabasePath)
$logPath = Join-Path (Split-Path -Parent $DatabasePath) 'logs'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$logFile = Join-Path $logPath ("{0}-{1}.log" -f $Task, [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $key = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($DatabasePath.ToLowerInvariant()))).Replace('-', '') }
finally { $sha.Dispose() }
$mutex = New-Object System.Threading.Mutex($false, "Local\InvestingHubML-$key")
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) {
        'Another lifecycle run owns this database; skipped.' | Out-File -LiteralPath $logFile
        exit 0
    }
    # Native stderr contains diagnostic logs; retain it without treating a
    # warning as a PowerShell terminating exception. Honor Python's exit code.
    $ErrorActionPreference = 'Continue'
    & $pythonPath $pipelinePath $Task.ToLowerInvariant() --db $DatabasePath *> $logFile
    $pipelineExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $pipelineExitCode
}
finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
