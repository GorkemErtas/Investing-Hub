param(
    [ValidateSet('Install', 'Status', 'Run', 'Uninstall', 'Preview')]
    [string]$Action = 'Status',
    [string]$DatabasePath = $env:INVESTING_HUB_ML_DB,
    [string]$PublicationPath,
    [string]$TaskName
)
$ErrorActionPreference = 'Stop'

function Get-DailyTaskContext {
    param([string]$DatabasePath, [string]$PublicationPath, [string]$TaskName)
    $repo = Split-Path -Parent $PSScriptRoot
    if (-not $DatabasePath) { $DatabasePath = Join-Path $PSScriptRoot 'data\lifecycle.sqlite3' }
    $database = [IO.Path]::GetFullPath($DatabasePath)
    if (-not $PublicationPath) { $PublicationPath = Join-Path (Split-Path -Parent $database) 'predictions.json' }
    $publication = [IO.Path]::GetFullPath($PublicationPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($database.ToLowerInvariant()))).Replace('-', '').Substring(0, 12) }
    finally { $sha.Dispose() }
    if (-not $TaskName) { $TaskName = "InvestingHub-Daily-$key" }
    if ($TaskName -cnotmatch '^[A-Za-z0-9_-]{1,90}$') { throw 'Invalid task name.' }
    $runner = Join-Path $PSScriptRoot 'run.ps1'
    $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($value in @($database, $publication, $runner)) { if ($value.Contains('"')) { throw 'Invalid path.' } }
    [pscustomobject]@{
        Name = $TaskName; Database = $database; Publication = $publication; Repo = $repo
        Python = (Join-Path $repo '.venv\Scripts\python.exe'); Shell = $shell
        Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Task Daily -DatabasePath `"$database`" -PublicationPath `"$publication`""
        Marker = "Investing-Hub daily predictions v1:$key"
    }
}

function New-DailyTaskXml {
    param($Context, [DateTime]$NowUtc = [DateTime]::UtcNow)
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('Turkey Standard Time')
    $local = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::SpecifyKind($NowUtc, [DateTimeKind]::Utc), $zone)
    $next = [DateTime]::SpecifyKind($local.Date.AddHours(3).AddMinutes(15), [DateTimeKind]::Unspecified)
    if ($next -le $local) { $next = $next.AddDays(1) }
    if ($zone.GetUtcOffset($next) -ne [TimeSpan]::FromHours(3)) { throw 'Istanbul rules changed; review UTC schedule.' }
    $boundary = [TimeZoneInfo]::ConvertTimeToUtc($next, $zone).ToString("yyyy-MM-ddTHH:mm:ss'Z'")
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $escape = { param($value) [Security.SecurityElement]::Escape($value) }
    # Explicit Z binds the daily trigger to UTC, independent of the host timezone.
    @"
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$(& $escape $Context.Marker)</Description></RegistrationInfo>
  <Triggers><CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
  <Principals><Principal id="CurrentUser"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><Hidden>true</Hidden><WakeToRun>true</WakeToRun><ExecutionTimeLimit>PT30M</ExecutionTimeLimit></Settings>
  <Actions Context="CurrentUser"><Exec><Command>$(& $escape $Context.Shell)</Command><Arguments>$(& $escape $Context.Arguments)</Arguments><WorkingDirectory>$(& $escape $Context.Repo)</WorkingDirectory></Exec></Actions>
</Task>
"@
}

function Assert-OwnedDailyTask {
    param($Task, $Context)
    if ($Task -and ($Task.Description -ne $Context.Marker -or
        @($Task.Actions).Count -ne 1 -or $Task.Actions[0].Execute -ne $Context.Shell -or
        $Task.Actions[0].Arguments -ne $Context.Arguments)) {
        throw 'Task name belongs to a different configuration; no changes made.'
    }
}

function Invoke-DailyTaskManager {
    param([string]$Action, $Context)
    if ($Action -eq 'Preview') { return New-DailyTaskXml $Context }
    if ($Action -eq 'Run') {
        & $Context.Shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run.ps1') -Task Daily -DatabasePath $Context.Database -PublicationPath $Context.Publication
        if ($LASTEXITCODE -ne 0) { throw 'Daily execution failed; inspect Status and daily logs.' }
        return
    }
    $task = Get-ScheduledTask -TaskName $Context.Name -TaskPath '\' -ErrorAction SilentlyContinue
    Assert-OwnedDailyTask $task $Context
    switch ($Action) {
        'Install' {
            if ($task -and $task.State -eq 'Running') { throw 'Wait for the running daily job before updating its schedule.' }
            foreach ($file in @($Context.Database, $Context.Python)) {
                if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Existing database and repository .venv required.' }
            }
            Register-ScheduledTask -TaskName $Context.Name -TaskPath '\' -Xml (New-DailyTaskXml $Context) -Force | Out-Null
            Write-Output 'Installed: daily 03:15 Europe/Istanbul / 00:15 UTC; current user must be signed in.'
        }
        'Uninstall' {
            if ($task -and $task.State -eq 'Running') { throw 'Wait for the running job before uninstalling.' }
            if ($task) { Unregister-ScheduledTask -TaskName $Context.Name -TaskPath '\' -Confirm:$false }
            Write-Output 'Daily schedule removed; database, models, forecasts and logs preserved.'
        }
        'Status' {
            if ($task) {
                $info = Get-ScheduledTaskInfo -TaskName $Context.Name -TaskPath '\'
                [pscustomobject]@{ Task = $Context.Name; State = $task.State; StartBoundary = $task.Triggers[0].StartBoundary; Schedule = 'Daily 00:15 UTC / 03:15 Europe/Istanbul'; StartWhenAvailable = $task.Settings.StartWhenAvailable; LastTaskResult = $info.LastTaskResult; LastRunUtc = $info.LastRunTime.ToUniversalTime(); NextRunUtc = $info.NextRunTime.ToUniversalTime() }
            } else { Write-Output 'Daily schedule is not installed.' }
            & $Context.Python (Join-Path $PSScriptRoot 'pipeline.py') daily-status --db $Context.Database
            if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect daily execution status.' }
        }
    }
}

# Dot sourcing exposes only functions for isolated tests; never touches Task Scheduler.
if ($MyInvocation.InvocationName -ne '.') {
    try { Invoke-DailyTaskManager $Action (Get-DailyTaskContext $DatabasePath $PublicationPath $TaskName) }
    catch { Write-Error $_.Exception.Message; exit 1 }
}
