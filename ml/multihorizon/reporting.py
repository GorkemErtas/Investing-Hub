"""Export reviewable evidence, without committing local runtime state or model files."""
import json
from pathlib import Path
from .data import save_json


def export_report(study, output):
    reports = json.loads(Path(study).read_text(encoding='utf-8'))
    output = Path(output)
    sanitized = json.loads(json.dumps(reports))
    for report in sanitized:
        for algorithm, artifact in report['artifacts'].items():
            artifact['path'] = Path(artifact['path']).resolve().relative_to(Path.cwd().resolve()).as_posix()
    save_json(output/'historical-v2-benchmark.json', sanitized)
    lines = ['# Historical minute benchmark evidence', '',
        'Real supplied Binance data; fixed CPU pilot configuration. No synthetic fitting data.',
        'Detailed folds, regimes, ablations, package versions, source/data hashes and artifact checksums are in',
        '[the JSON evidence](historical-v2-benchmark.json).', '',
        '## Selection decisions', '',
        '| Symbol | Horizon | Selected | Status | Lowest validation RMSE family | Validation / naive RMSE | Holdout / naive RMSE |',
        '|---|---|---|---|---|---|---|']
    for r in reports:
        candidates = r['candidates']
        ok = {n: c for n, c in candidates.items() if c['status'] == 'ok'}
        best = min(ok, key=lambda n: ok[n]['validation']['returnRmse'])
        chosen = r['selection']['algorithm'] or 'none'
        lines.append(f'| {r["symbol"]} | {r["horizon"]} | {chosen} | {r["selection"]["status"]} | {best} | {ok[best]["validation"]["baselineRelativeRmse"]:.5f} | {ok[best]["holdout"]["metrics"]["baselineRelativeRmse"]:.5f} |')
    lines += ['', 'All eight `1M` horizons are unavailable: insufficient independent monthly outcomes.', '',
        'Selection uses validation only: at least 1% log-return RMSE advantage, all three folds',
        'beating no-change, and positive lower paired daily-block MSE improvement after a',
        'Bonferroni correction for 144 comparisons. Simplicity breaks ties within 0.2%.',
        'The daily-block bootstrap assumes independent days; residual dependence and study',
        'design choices limit inference. No claim of financial predictability follows.',
        'Holdout never selects a candidate. A winning final fit could be marked experimental only.', '',
        '## Every candidate comparison', '',
        'Return errors are log-return units; price errors are USDT. Direction is a fraction.',
        'RSS is sampled absolute process resident memory, not model allocation or a hard OS limit.',
        'Latency is median of 30 single-origin NumPy inferences, excluding provider/network cost.', '',
        '| Pair | Family | Validation RMSE | Holdout RMSE | Holdout price MAE / RMSE | Direction | Validation fit s | RSS MiB | Inference ms | Artifact bytes |',
        '|---|---|---|---|---|---|---|---|---|---|']
    failures = []
    for r in reports:
        for name, c in r['candidates'].items():
            if c['status'] != 'ok':
                failures.append({'symbol': r['symbol'], 'horizon': r['horizon'], 'algorithm': name, 'error': c.get('error')})
                lines.append(f'| {r["symbol"]}/{r["horizon"]} | {name} | failed | — | — | — | — | — | — | — |')
                continue
            m = c['holdout']['metrics']
            lines.append(f'| {r["symbol"]}/{r["horizon"]} | {name} | {c["validation"]["returnRmse"]:.7g} | {m["returnRmse"]:.7g} | {m["priceMae"]:.6g} / {m["priceRmse"]:.6g} | {m["directionalAccuracy"]:.4f} | {c["validationFitSeconds"]:.2f} | {c["processPeakRssMb"]:.1f} | {c.get("numericInferenceMedianMs", 0):.4f} | {c.get("artifactBytes", 0)} |')
    lines += ['', '## Resource and study limits', '',
        f'Total measured pair execution time: {sum(r["totalSeconds"] for r in reports):.1f} seconds.',
        f'Completed pairs: {len(reports)}. Failed candidate comparisons: {len(failures)}.',
        'Each fit uses at most 12,000 evenly spaced origins from its expanding historical',
        'window. Evaluation spans full 28-day folds and a final 60-day holdout with capped',
        'non-overlapping origins. This evaluates all required families at a reduced CPU',
        'budget; it does not establish that larger fits or different pre-registered features',
        'cannot improve on no-change. LSTM has 8 hidden units and 3 fixed epochs; no GPU.', '',
        'Economic diagnostics assume sign-based unit exposure, 10 bps costs plus 2 bps',
        'slippage per unit turnover and final liquidation. Return sums and mean/std ratios',
        'are descriptive, unlevered, non-compounded diagnostics with irregular sampled origins;',
        'they are not an executable backtest, annualized Sharpe or profitability evidence.',
        'Volatility regime thresholds use only pre-holdout fitting data. Feature-group Ridge',
        'ablations use the last validation fold and do not change the fixed configuration.', '',
        'Original source archives/checksums were absent. CSV fingerprints and validated',
        'structure establish reproducibility, not independent proof of vendor origin.',
        'Monthly evaluation, production rollout and larger training studies remain deferred.']
    repairs = [(r['symbol'], r['horizon'], name, c['artifactRepair']) for r in reports
               for name, c in r['candidates'].items() if 'artifactRepair' in c]
    if repairs:
        originally_failed = sum(item['originalCandidateStatus'] == 'failed' for _, _, _, item in repairs)
        repair_seconds = sum(c.get('repairDurationSeconds', 0) for r in reports for c in r['candidates'].values())
        lines += ['', '## Artifact repair evidence', '',
            f'{len(repairs)} frozen deployment fits were re-exported and parity-tested on 10,000 historical origins each.',
            f'This includes {originally_failed} originally blocked exports. Additional repair duration: {repair_seconds:.1f} seconds.',
            'XGBoost and sklearn Random Forest cast model inputs to float32; portable inference',
            'now mirrors that behavior. XGBoost thresholds also retain their float32 semantics.',
            'Original failures, study checksums and corrected runtime source hashes are preserved',
            'in each artifactRepair record. No validation/holdout scores or selection decisions',
            'were recomputed or tuned. Model configurations and deployment fitting origins stayed fixed.',
            'The deployFitSeconds field in original evidence includes export/write and latency checks.']
    output.mkdir(parents=True, exist_ok=True)
    (output/'FORECAST_BENCHMARK.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    return failures
