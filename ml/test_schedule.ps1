# Invoked by unittest. Every mutating Task Scheduler cmdlet is replaced below.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'schedule.ps1')
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('data\test-schedule-' + [Guid]::NewGuid().ToString('N'))))
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'data')) + [IO.Path]::DirectorySeparatorChar
if (-not $testRoot.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture path' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
$database = Join-Path $testRoot 'test.sqlite3'
Set-Content -LiteralPath $database -Value 'TEST ONLY'
$context = Get-DailyTaskContext $database (Join-Path $testRoot 'predictions.json') 'InvestingHub-Test'
$script:fakeTask = $null
$script:installs = 0; $script:uninstalls = 0
function Get-ScheduledTask { param($TaskName, $TaskPath, $ErrorAction) return $script:fakeTask }
function Register-ScheduledTask {
    param($TaskName, $TaskPath, $Xml, [switch]$Force)
    $script:installs++
    [xml]$doc = $Xml
    $script:fakeTask = [pscustomobject]@{
        Description = $doc.Task.RegistrationInfo.Description; State = 'Ready'
        Actions = @([pscustomobject]@{ Execute = $doc.Task.Actions.Exec.Command; Arguments = $doc.Task.Actions.Exec.Arguments })
        Triggers = @([pscustomobject]@{ StartBoundary = $doc.Task.Triggers.CalendarTrigger.StartBoundary })
        Settings = [pscustomobject]@{ StartWhenAvailable = $true }
    }
}
function Unregister-ScheduledTask { param($TaskName, $TaskPath, $Confirm) $script:uninstalls++; $script:fakeTask = $null }
function Get-ScheduledTaskInfo { param($TaskName, $TaskPath) [pscustomobject]@{ LastTaskResult = 0; LastRunTime = [DateTime]::UtcNow; NextRunTime = [DateTime]::UtcNow.AddDays(1) } }
try {
    [xml]$xml = New-DailyTaskXml $context ([DateTime]'2026-11-08T09:00:00')
    Assert ($xml.Task.Triggers.CalendarTrigger.StartBoundary -eq '2026-11-09T00:15:00Z') 'UTC boundary'
    [xml]$early = New-DailyTaskXml $context ([DateTime]'2026-11-08T00:00:00')
    Assert ($early.Task.Triggers.CalendarTrigger.StartBoundary -eq '2026-11-08T00:15:00Z') 'next occurrence'
    Assert ($xml.Task.Settings.StartWhenAvailable -eq 'true') 'catch-up'
    Assert ($xml.Task.Settings.MultipleInstancesPolicy -eq 'IgnoreNew') 'overlap setting'
    Assert ($xml.Task.Settings.ExecutionTimeLimit -eq 'PT30M') 'bounded execution'
    Assert ($xml.Task.Principals.Principal.LogonType -eq 'InteractiveToken') 'no stored credentials'
    Assert ([IO.Path]::IsPathRooted($xml.Task.Actions.Exec.Command)) 'absolute shell'
    Assert ($xml.Task.Actions.Exec.Arguments.Contains($database)) 'absolute database'
    Assert (-not $xml.Task.Actions.Exec.Arguments.Contains('npm')) 'independent of servers'
    $runner = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'run.ps1') -Raw
    Assert ($runner.Contains(".venv\Scripts\python.exe")) 'repository virtualenv'
    Assert ($runner.Contains('25 * 60 * 1000')) 'finite Python execution'
    # Status is a read-only Python command; use a fixture command for this manager test.
    $statusStub = Join-Path $testRoot 'status.cmd'
    Set-Content -LiteralPath $statusStub -Value "@echo off`r`necho fixture_status`r`nexit /b 0" -Encoding ASCII
    $realPython = $context.Python
    $context.Python = $statusStub
    Invoke-DailyTaskManager 'Status' $context | Out-Null
    Invoke-DailyTaskManager 'Install' $context | Out-Null
    Invoke-DailyTaskManager 'Status' $context | Out-Null
    Assert ($script:installs -eq 1 -and $script:uninstalls -eq 0) 'install/status boundaries'
    $script:fakeTask.State = 'Running'
    $rejected = $false
    try { Invoke-DailyTaskManager 'Uninstall' $context } catch { $rejected = $true }
    Assert $rejected 'running task must be preserved'
    $script:fakeTask.State = 'Ready'
    $script:fakeTask.Description = 'UNRELATED TASK'
    $rejected = $false
    try { Invoke-DailyTaskManager 'Install' $context } catch { $rejected = $true }
    Assert $rejected 'unrelated install protection'
    $rejected = $false
    try { Invoke-DailyTaskManager 'Uninstall' $context } catch { $rejected = $true }
    Assert $rejected 'unrelated uninstall protection'
    $script:fakeTask.Description = $context.Marker
    Invoke-DailyTaskManager 'Uninstall' $context | Out-Null
    Invoke-DailyTaskManager 'Uninstall' $context | Out-Null
    Assert ($script:uninstalls -eq 1) 'idempotent uninstall'
    Assert (Test-Path -LiteralPath $database) 'database preservation'
    Assert ($script:installs -eq 1) 'no implicit registration'
    $context.Shell = $statusStub
    Invoke-DailyTaskManager 'Run' $context | Out-Null
    Assert ($script:installs -eq 1) 'manual run never installs a task'
    'scheduler_mocks_passed'
}
finally {
    if (-not $testRoot.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup' }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
