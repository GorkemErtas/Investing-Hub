param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Daily', 'DailyStatus', 'Sync', 'Validate', 'Train', 'Evaluate', 'Select', 'Predict', 'Reconcile', 'Status')]
    [string]$Task,
    [string]$DatabasePath = $env:INVESTING_HUB_ML_DB,
    [string]$PublicationPath
)
# Explicit invocation only. Python owns the one lock across the complete daily job.
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoPath '.venv\Scripts\python.exe'
$pipelinePath = Join-Path $PSScriptRoot 'pipeline.py'
if (-not $DatabasePath) { $DatabasePath = Join-Path $PSScriptRoot 'data\lifecycle.sqlite3' }
$DatabasePath = [IO.Path]::GetFullPath($DatabasePath)
if (-not $PublicationPath) { $PublicationPath = Join-Path (Split-Path -Parent $DatabasePath) 'predictions.json' }
$PublicationPath = [IO.Path]::GetFullPath($PublicationPath)

function Write-RunnerFailure([string]$Code) {
    $logDirectory = Join-Path (Split-Path -Parent $DatabasePath) 'logs\daily'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $files = @(Get-ChildItem -LiteralPath $logDirectory -Filter 'daily-*.jsonl' -File | Sort-Object Name -Descending)
    for ($index = 0; $index -lt $files.Count; $index++) {
        if ($index -ge 59 -or $files[$index].LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-30)) {
            Remove-Item -LiteralPath $files[$index].FullName -Force
        }
    }
    $utc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $file = Join-Path $logDirectory ('daily-' + [DateTime]::UtcNow.ToString('yyyy-MM-ddTHHmmssfffZ') + '-runner.jsonl')
    @(
        (@{ utc = $utc; event = 'started' } | ConvertTo-Json -Compress),
        (@{ utc = $utc; event = 'finished'; status = 'failure'; stage = 'runner'; error = $Code } | ConvertTo-Json -Compress)
    ) | Set-Content -LiteralPath $file -Encoding UTF8
}
try {
    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) { throw 'python_environment_missing' }
    $command = if ($Task -eq 'DailyStatus') { 'daily-status' } else { $Task.ToLowerInvariant() }
    $arguments = @($pipelinePath, $command, '--db', $DatabasePath)
    if ($Task -in @('Daily', 'Predict')) { $arguments += @('--output', $PublicationPath) }
    if ($Task -ne 'Daily') {
        & $pythonPath @arguments
        exit $LASTEXITCODE
    }
    # Bounded child process; no shell, no visible window, no child worker tree.
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $pythonPath
    foreach ($value in $arguments) { if ($value.Contains('"')) { throw 'invalid_argument' } }
    $info.Arguments = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $info.WorkingDirectory = $repoPath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        $startedUtc = [DateTime]::UtcNow
        if (-not $process.Start()) { throw 'python_start_failed' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(25 * 60 * 1000)) {
            $process.Kill()
            $process.WaitForExit()
            Write-RunnerFailure 'execution_timeout'
            Write-Output 'Daily execution timed out; inspect DailyStatus.'
            exit 124
        }
        $code = $process.ExitCode
        if ($code -eq 0) { Write-Output $stdout.Result }
        else {
            # Preserve the specific Python stage log; fallback only if startup produced no log.
            $directory = Join-Path (Split-Path -Parent $DatabasePath) 'logs\daily'
            $recent = @(Get-ChildItem -LiteralPath $directory -Filter 'daily-*.jsonl' -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -ge $startedUtc })
            if ($recent.Count -eq 0) { Write-RunnerFailure 'python_nonzero_exit' }
            Write-Output 'Daily execution failed; inspect DailyStatus and daily logs.'
        }
        exit $code
    }
    finally { $process.Dispose() }
}
catch {
    if ($Task -eq 'Daily') { Write-RunnerFailure 'runner_start_failed' }
    Write-Output 'ML command failed to start; verify the environment and local configuration.'
    exit 1
}
