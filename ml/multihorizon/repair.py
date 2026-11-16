"""Re-export frozen deployment fits after a runtime fix; never rescore/tune holdout."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from threadpoolctl import threadpool_limits
from .data import load_symbol, save_json, sha256, digest
from .features import FEATURES, prepare, sequences
from .models import candidate, export_model, numeric_predict


def repair_artifacts(study, dataset, output, algorithm='xgboost'):
    """New immutable evidence, preserving the original failed attempts and scores."""
    study, output = Path(study), Path(output)
    reports = json.loads(study.read_text(encoding='utf-8'))
    original_checksum = sha256(study)
    for report in reports:
        row = report['candidates'][algorithm]
        if 'holdout' not in row:
            raise ValueError('repair_requires_completed_frozen_evaluation')
        frame, fingerprint = load_symbol(dataset, report['symbol'])
        if fingerprint != report['datasetFingerprint']:
            raise ValueError('repair_dataset_mismatch')
        data, history = prepare(frame, report['horizon'])
        x = sequences(history.loc[:, FEATURES].to_numpy(dtype=float)) if algorithm == 'lstm' else data.loc[:, FEATURES].to_numpy(dtype=float)
        y = data.target.to_numpy(dtype=float)
        config = report['config']
        train = np.linspace(0, len(data)-1, min(config['maxTrainRows'], len(data)), dtype=int)
        began = time.perf_counter()
        with threadpool_limits(limits=1):
            model = candidate(algorithm, config['seed'], config['lstmEpochs']).fit(x[train], y[train])
            # Verify across the full history, including repeated cyclical/zero feature values.
            # This is serialization testing; it does not compute predictive performance.
            parity = x[np.linspace(0, len(x)-1, 10000, dtype=int)]
            artifact = export_model(model, algorithm, parity)
        repair = {'reason': 'float32 input/split-comparison runtime parity correction; fitting configuration unchanged',
            'originalStudySha256': original_checksum, 'originalRunId': report['runId'],
            'originalCandidateStatus': row['status'], 'originalError': row.get('error'),
            'runtimeSourceSha256': sha256(Path(__file__).parent/'models.py'),
            'repairSourceSha256': sha256(Path(__file__)), 'createdAt': datetime.now(timezone.utc).isoformat()}
        revision = digest(repair)[:16]
        path = output.parent/f'artifact-repairs/{report["symbol"]}-{report["horizon"]}-{revision}.json'
        save_json(path, artifact)
        timings = []
        for _ in range(30):
            clock = time.perf_counter()
            numeric_predict(artifact, x[-1:])
            timings.append((time.perf_counter()-clock)*1000)
        row.update(status='ok', artifactRepair=repair, artifactBytes=path.stat().st_size,
            parityMaxAbsoluteError=artifact['parityMaxAbsoluteError'], numericInferenceMedianMs=float(np.median(timings)),
            repairDurationSeconds=time.perf_counter()-began)
        row.pop('error', None)
        report['artifacts'][algorithm] = {'path': str(path.resolve()), 'sha256': sha256(path),
            'trainingPeriod': {'start': int(data.source_time.iloc[0]), 'lastTarget': int(data.target_time.iloc[-1])},
            'runtimeRequirements': ['numpy'], 'modelVersion': f'{report["symbol"]}-{report["horizon"]}-{algorithm}-{revision}'}
        # Preserve the original validation-only decision; a repair cannot select another model.
        print(json.dumps({'event': 'artifact_repaired', 'symbol': report['symbol'], 'horizon': report['horizon'],
                          'algorithm': algorithm, 'parityMaxAbsoluteError': artifact['parityMaxAbsoluteError']}), flush=True)
    save_json(output, reports)
    return reports
