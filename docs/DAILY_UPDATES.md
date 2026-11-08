# Daily local prediction updates

The optional Windows schedule runs **03:15 Europe/Istanbul (00:15 UTC)**. Installation writes an explicit UTC `StartBoundary`, using Windows `Turkey Standard Time` rules, rather than assuming the computer's timezone. A daily UTC trigger stays independent of host daylight-saving changes; see [Microsoft StartBoundary documentation](https://learn.microsoft.com/en-us/windows/win32/taskschd/trigger-startboundary). If Turkey changes its UTC offset, review and reinstall the schedule.

## Run locally

From the repository root, use the existing `.venv` and SQLite database. Initial setup is in [the ML guide](../ml/README.md). Existing selected models need **no retraining or reselection** for daily updates.

```powershell
npm ci
npm run dev
# A separate terminal; works with both application servers stopped:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\run.ps1 -Task Daily
```

The daily job invokes the existing CLI operations: `sync` → `validate` → `reconcile` → `predict` (generate all eight, atomically publish) → verify the publication. Only missing Binance data is fetched. UTC completion, current source day, no gaps, provenance, fingerprints, feature compatibility, checksums and forecast chronology remain mandatory. Reconciliation appends actual outcomes without changing original predicted numbers. Model metadata, weights, selections and evaluation history are preserved. Historical predictive scores never block a technically valid forecast.

One OS file lock, `<database>.job.lock`, covers the entire sequence and is shared with other mutating CLI commands. A busy job fails instead of starting concurrently. The persistent lock file is not a stale-lock signal: the OS releases ownership when the process exits. Do not delete it to bypass an active job. Repeated runs reuse source rows and immutable forecast identities; they refresh publication without creating duplicate forecasts.

Binance requests have twenty-second timeouts and at most three attempts, with 0.5/1-second backoff. Restrictions/rate limits stop the sync immediately. The wrapper limits a daily Python process to twenty-five minutes; Task Scheduler limits the whole task to thirty. There is no detached worker, daily training, task-level automatic paid call or indefinite retry. Failure exits nonzero and leaves the previous publication bytes in place when a complete set cannot be generated. A previous publication can still expire or be rejected after the database changes; the API then returns unavailable rather than serving stale prices.

## Opt-in Task Scheduler management

Nothing registers a task during installation, tests or startup. These explicit commands manage only this database's task:

```powershell
# Read the proposed XML without registering anything:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\schedule.ps1 -Action Preview
# Enable automatic updates:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\schedule.ps1 -Action Install
# Inspect schedule, last result, next run and latest local execution:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\schedule.ps1 -Action Status
# Run now without installing a task:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\schedule.ps1 -Action Run
# Disable automatic updates, preserving data and logs:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ml\schedule.ps1 -Action Uninstall
```

Tasks use the current user's interactive token and least privilege, storing no password. **That user must remain signed in**; locking the desktop is fine. The computer must be running or able to wake/resume, with Internet access and access to the checkout, virtualenv and data. `WakeToRun` requests wake-up, but hardware/power policy can prevent it. `StartWhenAvailable` permits catch-up after a missed run; it does not recreate forecasts for missed target days. A powered-off computer cannot execute the task. Moving the checkout or database requires uninstalling the old configuration and installing the new one. Installation/uninstallation refuses unrelated tasks and refuses to replace/remove a running task; wait for completion first.

All scheduled executable, script, working-directory, database and publication paths are absolute. Defaults use `ml/data/lifecycle.sqlite3` and adjacent `predictions.json`. Prefer a local directory outside active OneDrive/network synchronization for normal operation. To use another location, supply the same `-DatabasePath 'C:\InvestingHubData\lifecycle.sqlite3' -PublicationPath 'C:\InvestingHubData\predictions.json'` to every management/run command. Configure backend `ML_DATABASE_PATH` and `PREDICTIONS_EXPORT_PATH` to match. No API/web process is needed by the task.

## Local logs and read-only status

```powershell
powershell.exe -NoProfile -File .\ml\run.ps1 -Task DailyStatus
# Equivalent Python read-only command:
.\.venv\Scripts\python.exe ml/pipeline.py daily-status
# Inspect local structured log records:
Get-Content .\ml\data\logs\daily\daily-*.jsonl
```

Daily JSON-lines records contain UTC start/finish times, step names, per-symbol sync/reconciliation counts, valid-forecast counts, network retry attempts and sanitized error classes/codes. They contain no credentials, provider response contents or private paths. At most sixty executions and thirty days are retained when the next job starts; each log is bounded. Python logs identify the failing stage; runner logs cover startup failure/timeouts. `daily-status` reports success/failure or an unfinished run without changing files or opening SQLite. If forcibly stopped, a run can remain `interrupted_or_running`; the scheduler's state and last task result distinguish this from an active job. No external monitoring service is used.

## Backup and restore without replacing existing data

```powershell
# Destination must be new; SQLite's backup API takes a consistent snapshot:
.\.venv\Scripts\python.exe ml/pipeline.py backup --output 'C:\InvestingHubData\backup-20261108.sqlite3'
```

To restore, uninstall the schedule and wait for every CLI writer to finish. Keep the original database, its backups and model artifacts. Copy a chosen backup to a **new** local filename; never overwrite the current database:

```powershell
$restorePath = 'C:\InvestingHubData\restored.sqlite3'
if (Test-Path -LiteralPath $restorePath) { throw 'Choose a new restore destination' }
Copy-Item -LiteralPath 'C:\InvestingHubData\backup-20261108.sqlite3' -Destination $restorePath
.\.venv\Scripts\python.exe ml/pipeline.py status --db $restorePath
powershell.exe -NoProfile -File .\ml\run.ps1 -Task Daily -DatabasePath $restorePath
```

Confirm all eight forecasts, then point the backend at this restored database and its adjacent new publication; install a schedule for that explicit path if wanted. A snapshot restored from an older date needs sync before freshness validation succeeds. Do not edit fingerprints, model metadata or timestamps to make an invalid backup pass checks. No database reset/migration, scheduler installation, deployment or paid API call is part of verification.
