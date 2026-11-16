# Legacy cleanup report and deletion manifest

The replacement's ingestion, feature, API and UI paths have executed validation.
The study does **not** establish a publishable short-horizon winner. Full removal
of the working daily forecasting system is therefore deferred, as required by
the migration safety gate.

## Explicit tracked deletion manifest

| Location | Removed content | Evidence |
|---|---|---|
| `webapp/src/pages/Dashboard.tsx` | Old prediction navigation teaser markup and unused FlaskConical import | Replaced by the tested same-coin forecast panel |
| `webapp/src/index.css` | `.prediction-teaser`, `.prediction-icon`, `.teaser-grid` and their responsive overrides | No remaining application references; complete browser regressions and focused panel tests passed before removal |

No complete tracked files, historical models, dependencies, jobs, endpoints,
SQLite databases, backups, source CSVs or ignored local datasets were deleted.
Unused legacy localization keys remain for compatibility; removing them is not
necessary for this migration. Existing `/predictions` and `/future-analysis`
bookmarks still work, with a migration link to the same selected coin/chart.
Market-table forecast actions now stay in the main market view.

## Preserved active dependencies

The daily lifecycle CLI, SQLite schema/immutable ledgers, v1 publication reader,
native prediction component, PowerShell daily scheduling, Railway daily worker,
Torch/sklearn requirements and archived ONNX artifacts remain. They still serve
the last known-good path or reproducibility evidence. No ignored runtime model
was assumed obsolete. Removing the daily dependencies would currently break
supported behavior, so Docker retains them.

## Future deletion gate

A future replacement must demonstrate adequate out-of-sample quality and pass
operational Linux/container verification before the daily path is retired.
Inventory actual production consumers, schedule ownership and persisted evidence
first. Keep immutable historical evidence and backups even after runtime retirement.
No database or production-data destructive operation is part of this branch.
