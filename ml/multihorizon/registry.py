"""Versioned portable registry and checksum-checked, bounded numeric artifacts."""
import json
from pathlib import Path
from .data import SYMBOLS, digest, save_json, sha256
from .features import FEATURE_VERSION, FEATURES, HORIZONS


def build_registry(study, destination):
    reports = json.loads(Path(study).read_text(encoding='utf-8'))
    by_pair = {(r['symbol'], r['horizon']): r for r in reports}
    if len(by_pair) != len(reports):
        raise ValueError('duplicate_study_pair')
    destination = Path(destination)
    entries = []
    for symbol in SYMBOLS:
        for horizon in HORIZONS:
            report = by_pair.get((symbol, horizon))
            item = {'symbol': symbol, 'horizon': horizon, 'status': 'unavailable', 'algorithm': None,
                'modelVersion': None, 'reason': 'monthly_insufficient_independent_outcomes' if horizon == '1M' else 'benchmark_missing'}
            if report is not None:
                item.update(report['selection'])
                item['runId'] = report['runId']
                item['datasetFingerprint'] = report['datasetFingerprint']
                item['featureSchema'] = report['featureSchema']
                algorithm = item['algorithm']
                if algorithm:
                    candidate = report['candidates'][algorithm]
                    if candidate['status'] != 'ok' or report['featureSchema'] != FEATURE_VERSION:
                        raise ValueError('unverified_selected_model')
                    info = report['artifacts'][algorithm]
                    source = Path(info['path'])
                    if sha256(source) != info['sha256']:
                        raise ValueError('artifact_checksum_mismatch')
                    artifact = json.loads(source.read_text(encoding='utf-8'))
                    relative = f'{symbol}-{horizon}-{report["runId"][:16]}.json'
                    target = destination.parent / relative
                    save_json(target, artifact)
                    item.update(modelVersion=info['modelVersion'], artifact=relative, artifactSha256=sha256(target),
                        trainingPeriod=info['trainingPeriod'], evaluationMetrics={
                            'validationReturnRmse': candidate['validation']['returnRmse'],
                            'holdoutReturnRmse': candidate['holdout']['metrics']['returnRmse'],
                            'baselineHoldoutReturnRmse': candidate['holdout']['baseline']['returnRmse'],
                            'holdoutDirectionalAccuracy': candidate['holdout']['metrics']['directionalAccuracy']},
                        runtimeRequirements=info['runtimeRequirements'])
            entries.append(item)
    payload = {'version': 'forecast-registry-v2', 'entries': entries}
    save_json(destination, {'payload': payload, 'sha256': digest(payload)})
    return payload


class Registry:
    def __init__(self, path):
        self.path = Path(path)
        self.key, self.entries, self.models = None, {}, {}

    def refresh(self):
        stamp = self.path.stat()
        key = (stamp.st_mtime_ns, stamp.st_ctime_ns, stamp.st_size)
        if key == self.key:
            return
        if stamp.st_size > 1024*1024:
            raise ValueError('oversized_registry')
        envelope = json.loads(self.path.read_text(encoding='utf-8'))
        value = envelope['payload']
        if digest(value) != envelope['sha256'] or value['version'] != 'forecast-registry-v2':
            raise ValueError('registry_checksum_or_version')
        entries = {(r['symbol'], r['horizon']): r for r in value['entries']}
        if set(entries) != {(s, h) for s in SYMBOLS for h in HORIZONS} or len(value['entries']) != len(entries):
            raise ValueError('invalid_registry_pairs')
        models = {}
        for pair, item in entries.items():
            if item['status'] != 'experimental':
                continue
            if pair[1] == '1M' or item['algorithm'] == 'naive' or item['featureSchema'] != FEATURE_VERSION:
                raise ValueError('unvalidated_registry_entry')
            path = (self.path.parent/item['artifact']).resolve()
            if not path.is_relative_to(self.path.parent.resolve()) or path.stat().st_size > 2*1024*1024:
                raise ValueError('artifact_path_or_size')
            if sha256(path) != item['artifactSha256']:
                raise ValueError('artifact_checksum')
            artifact = json.loads(path.read_text(encoding='utf-8'))
            if artifact['schema'] != FEATURE_VERSION or artifact['features'] != list(FEATURES) or artifact['algorithm'] != item['algorithm']:
                raise ValueError('artifact_identity')
            models[pair] = artifact
        # Commit cache only after the entire generation validates.
        self.entries, self.models, self.key = entries, models, key

    def get(self, symbol, horizon):
        self.refresh()
        return self.entries[symbol, horizon], self.models.get((symbol, horizon))
