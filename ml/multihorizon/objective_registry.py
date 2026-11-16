"""Independent objective decisions. Development evidence alone cannot activate inference."""
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from .data import SYMBOLS, digest, save_json, sha256
from .features import HORIZONS
from .objective_features import OBJECTIVE_FEATURE_VERSION

FUTURE_START = 1796083200000  # 2026-12-01 UTC
FUTURE_END = 1803859200000    # 2027-03-01 UTC


def confirmation_valid(value, artifact_sha, now_ms):
    """Explicit prospective proof boundary; no retrospective 'accepted' status shortcut."""
    try:
        return bool(value['version'] == 'objective-confirmation-v1' and
            value['artifactSha256'] == artifact_sha and len(artifact_sha) == 64 and
            value['startMs'] == FUTURE_START and value['endExclusiveMs'] == FUTURE_END and
            value['endExclusiveMs'] <= now_ms and value['frozenAtMs'] < FUTURE_START and
            value['trainingTargetEndMs'] < FUTURE_START and value['effectiveWeeklyBlocks'] >= 8 and
            value['allFoldsWin'] is True and value['calibrationPass'] is True and
            value['relativeLossImprovement'] >= .01 and value['simultaneousLowerImprovement'] > 0 and
            value['familySize'] >= 912 and len(value['datasetFingerprint']) == 64)
    except (KeyError, TypeError):
        return False


def research_candidate(rows, objective):
    eligible = [r for r in rows if r.get('status') == 'completed' and r['trial']['objective'] == objective and
        not r['trial'].get('removed') and not r['trial'].get('ablation') and
        (objective != 'direction' or r['trial']['mode'] == 'neutral')]
    if not eligible:
        return None
    metric = 'logLoss' if objective == 'direction' else 'qlike'
    qualified = [r for r in eligible if r.get('developmentEligible')]
    return min(qualified or eligible, key=lambda r: (r['metrics'][metric], r['trial']['id']))


def objective_unavailable(reason, evaluation=None):
    return {'status': 'unavailable', 'reason': reason, 'modelVersion': None, 'algorithm': None,
            'evaluation': evaluation}


def catalog_from_study(directory, destination):
    directory, destination = Path(directory), Path(destination)
    entries = []
    for symbol in SYMBOLS:
        for horizon in HORIZONS:
            pair = directory/symbol/horizon
            rows = []
            if (pair/'header.json').is_file():
                for path in pair.glob('*.json'):
                    record = json.loads(path.read_text(encoding='utf-8'))
                    if 'trial' in record:
                        rows.append(record)
            objectives = {}
            for objective in ('direction', 'volatility'):
                row = research_candidate(rows, objective)
                reason = 'monthly_insufficient_independent_outcomes' if horizon == '1M' else 'objective_benchmark_missing'
                evaluation = None
                if row:
                    reason = 'future_confirmation_required' if row.get('developmentEligible') else f'no_robust_{objective}_advantage'
                    evaluation = {'period': 'development', 'candidate': row['trial']['id'],
                        'primaryLoss': row['metrics']['logLoss' if objective == 'direction' else 'mae'],
                        'baselineRelativeImprovement': row['baselineRelativeImprovement'],
                        'calibrationError': row['metrics'].get('ece'),
                        'intervalCoverage': row['metrics'].get('intervalCoverage'),
                        'developmentEligible': row['developmentEligible'], 'futureConfirmed': False, 'confirmationEnd': None}
                objectives[objective] = objective_unavailable(reason, evaluation)
            entries.append({'symbol': symbol, 'horizon': horizon, 'objectives': objectives})
    value = {'version': 'objective-registry-v1', 'createdAt': datetime.now(timezone.utc).isoformat(), 'entries': entries}
    save_json(destination, {'payload': value, 'sha256': digest(value)})
    return value


class ObjectiveRegistry:
    def __init__(self, path, clock=lambda: int(time.time()*1000)):
        self.path, self.clock = Path(path), clock
        self.key, self.entries, self.models = None, {}, {}

    def refresh(self):
        info = self.path.stat()
        key = info.st_mtime_ns, info.st_ctime_ns, info.st_size
        if key == self.key:
            return
        if info.st_size > 1024*1024:
            raise ValueError('objective_registry_oversized')
        envelope = json.loads(self.path.read_text(encoding='utf-8'))
        payload = envelope['payload']
        if envelope['sha256'] != digest(payload) or payload['version'] != 'objective-registry-v1':
            raise ValueError('objective_registry_integrity')
        entries = {(e['symbol'], e['horizon']): e['objectives'] for e in payload['entries']}
        if set(entries) != {(s, h) for s in SYMBOLS for h in HORIZONS} or len(entries) != len(payload['entries']):
            raise ValueError('objective_registry_pairs')
        models = {}
        for pair, objectives in entries.items():
            if set(objectives) != {'direction', 'volatility'}:
                raise ValueError('objective_registry_objectives')
            for objective, item in objectives.items():
                if item['status'] == 'unavailable':
                    continue
                if item['status'] != 'validated' or pair[1] == '1M':
                    raise ValueError('unvalidated_objective_entry')
                if not confirmation_valid(item.get('confirmation', {}), item.get('artifactSha256', ''), self.clock()):
                    raise ValueError('future_confirmation_required')
                path = (self.path.parent/item['artifact']).resolve()
                if not path.is_relative_to(self.path.parent.resolve()) or path.stat().st_size > 2*1024*1024:
                    raise ValueError('objective_artifact_path_or_size')
                if sha256(path) != item['artifactSha256']:
                    raise ValueError('objective_artifact_checksum')
                artifact = json.loads(path.read_text(encoding='utf-8'))
                if artifact['objective'] != objective or artifact['schema'] != OBJECTIVE_FEATURE_VERSION:
                    raise ValueError('objective_artifact_schema')
                if objective == 'direction' and ('temperature' not in artifact or artifact['classes'] != 3):
                    raise ValueError('validated_neutral_calibrated_probabilities_required')
                models[pair+(objective,)] = artifact
        self.entries, self.models, self.key = entries, models, key

    def get(self, symbol, horizon, objective):
        self.refresh()
        return self.entries[symbol, horizon][objective], self.models.get((symbol, horizon, objective))
