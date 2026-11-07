"""Explicit approval, transactional promotion and audited rollback."""
from __future__ import annotations

import json

from common import DAY_MS, canonical
from features import FEATURES, FEATURE_VERSION
from forecast import baseline_rows, forward_rows, score_rows


def check_usable(model, config, now):
    report = model['metadata']
    if report['feature_version'] != FEATURE_VERSION or report['feature_order'] != FEATURES:
        raise ValueError('Model feature contract mismatch')
    if report['artifact_checksum'] != model['checksum']:
        raise ValueError('Artifact manifest checksum mismatch')
    if not 0 <= now - report['trained_at'] <= config['max_model_age_days'] * DAY_MS:
        raise ValueError('Model training timestamp invalid or expired')


def evaluate(store, model_id, config, now, record=True):
    model = store.model(model_id)
    check_usable(model, config, now)
    report = model['metadata']
    reasons = []
    folds = report['walk_forward']
    improvement = config['required_relative_rmse_improvement']
    historical_ok = (len(folds) >= config['walk_forward_splits'] and
        all(f['train_target_end'] < f['evaluation_source_start'] for f in folds) and
        sum(f['metrics']['return_rmse'] < f['no_change']['return_rmse'] for f in folds) >= config['minimum_fold_wins'] and
        report['validation_metrics']['return_rmse'] < report['baseline_metrics']['return_rmse'] * (1 - improvement))
    if not historical_ok:
        reasons.append('Historical development/selection gate failed')
    observations = forward_rows(store, model, now)
    minimum = config['min_forward_samples']
    model_score = baseline_score = paired = None
    if len(observations) < minimum:
        reasons.append(f'Need {minimum} prospective observations; have {len(observations)}')
    else:
        model_score, baseline_score = score_rows(observations), baseline_rows(observations)
        if model_score['return_rmse'] >= baseline_score['return_rmse'] * (1 - improvement):
            reasons.append('Prospective no-change baseline gate failed')
    active = store.active(model['symbol'])
    if active and active['id'] != model_id:
        incumbent = {r['target_time']: r for r in forward_rows(store, active, now)}
        candidate_rows = [r for r in observations if r['target_time'] in incumbent]
        active_rows = [incumbent[r['target_time']] for r in candidate_rows]
        if len(candidate_rows) < minimum:
            reasons.append('Insufficient paired prospective observations against active model')
        else:
            paired = {'candidate': score_rows(candidate_rows), 'active': score_rows(active_rows)}
            if paired['candidate']['return_rmse'] >= paired['active']['return_rmse']:
                reasons.append('Candidate did not improve on active model on identical target dates')
    if model['status'] in ('rejected', 'archived'):
        reasons.append('Rejected/archived models cannot be promoted; rollback is separate')
    result = {'model_id': model_id, 'eligible': not reasons, 'reasons': reasons,
              'historical_pass': historical_ok, 'forward_samples': len(observations),
              'metrics': model_score, 'no_change': baseline_score, 'paired_active': paired,
              'active_model_id': active['id'] if active else None, 'evaluated_at': now}
    # Evaluation records evidence without destroying a candidate that is still
    # accumulating forward observations, or changing the active model.
    if record:
        store.event('evaluation', result, now)
    return result


def approve(store, model_id, config, now):
    result = evaluate(store, model_id, config, now)
    if not result['eligible']:
        return result
    store.db.execute("UPDATE models SET status='approved' WHERE id=? AND status='candidate'", (model_id,))
    store.event('approved', {'model_id': model_id}, now)
    return result


def promote(store, model_id, config, now):
    model = store.model(model_id)
    if model['status'] != 'approved':
        return {'model_id': model_id, 'eligible': False, 'reasons': ['Explicit approval required before promotion']}
    result = evaluate(store, model_id, config, now)
    if not result['eligible']:
        return result
    active = store.active(model['symbol'])
    store.db.execute("UPDATE models SET status='archived' WHERE symbol=? AND status='active'", (model['symbol'],))
    store.db.execute("UPDATE models SET status='active' WHERE id=?", (model_id,))
    store.event('promoted', {'model_id': model_id, 'previous': active['id'] if active else None}, now)
    return result


def reject(store, model_id, reason, now):
    model = store.model(model_id)
    if model['status'] not in ('candidate', 'approved'):
        raise ValueError('Only candidate/approved models can be rejected')
    if not reason.strip():
        raise ValueError('Rejection reason required')
    store.db.execute("UPDATE models SET status='rejected' WHERE id=?", (model_id,))
    store.event('rejected', {'model_id': model_id, 'reason': reason}, now)
    return {'model_id': model_id, 'status': 'rejected'}


def rollback(store, model_id, config, now, reason):
    model = store.model(model_id)
    check_usable(model, config, now)
    if model['status'] != 'archived' or not reason.strip():
        raise ValueError('Rollback requires an archived prior active model and a reason')
    events = store.db.execute("SELECT details FROM events WHERE kind IN ('promoted','rollback')").fetchall()
    if not any(json.loads(e[0])['model_id'] == model_id for e in events):
        raise ValueError('Model was never approved and active; rollback refused')
    previous = store.active(model['symbol'])
    store.db.execute("UPDATE models SET status='archived' WHERE symbol=? AND status='active'", (model['symbol'],))
    store.db.execute("UPDATE models SET status='active' WHERE id=?", (model_id,))
    result = {'model_id': model_id, 'previous': previous['id'] if previous else None, 'reason': reason}
    store.event('rollback', result, now)
    return result
