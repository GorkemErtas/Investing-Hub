"""Select among frozen comparable evaluations without importing model fitting."""

PIPELINE_VERSION = 'price-predictions-v1'
ALGORITHMS = ('ridge', 'gradient_boosting', 'random_forest', 'lstm')


def select_best(store, symbol, config, now):
    dataset = store.dataset(symbol)
    models = [store.model(row[0]) for row in store.db.execute('SELECT id FROM models WHERE symbol=?', (symbol,)).fetchall()]
    models = [m for m in models if m['metadata'].get('pipeline_version') == PIPELINE_VERSION and
              m['metadata']['dataset_fingerprint'] == (dataset or {}).get('fingerprint') and m['metadata']['config'] == config]
    if not models:
        raise ValueError('Train current candidates before model selection')
    # Never mix versions, data, environments or evaluation windows.
    newest = max(models, key=lambda m: (m['metadata']['trained_at'], m['metadata']['comparison_id']))['metadata']['comparison_id']
    models = [m for m in models if m['metadata']['comparison_id'] == newest]
    if set(m['metadata']['algorithm'] for m in models) != set(ALGORITHMS):
        raise ValueError('Incomplete comparable candidate set')
    error = min(m['metadata']['validation_metrics']['price_rmse_usdt'] for m in models)
    equivalent = [m for m in models if m['metadata']['validation_metrics']['price_rmse_usdt'] <= error*(1+config['selection_tolerance'])]
    chosen = min(equivalent, key=lambda m: (ALGORITHMS.index(m['metadata']['algorithm']), m['id']))
    store.db.execute("UPDATE models SET status='archived' WHERE symbol=? AND status='active' AND id<>?", (symbol, chosen['id']))
    store.db.execute("UPDATE models SET status='active' WHERE id=?", (chosen['id'],))
    store.event('model_selected', {'symbol': symbol, 'model_id': chosen['id'],
        'rule': 'selection_price_rmse_with_relative_tolerance_then_simplicity_then_id',
        'tolerance': config['selection_tolerance']}, now)
    return {'symbol': symbol, 'model_id': chosen['id'], 'algorithm': chosen['metadata']['algorithm'],
            'selection': chosen['metadata']['validation_metrics'], 'final_evaluation': chosen['metadata']['final_evaluation']['metrics']}
