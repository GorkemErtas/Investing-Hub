"""Offline trusted-artifact inference. Never load downloaded/untrusted joblib files."""
import argparse
import json

import joblib
import pandas as pd

from features import FEATURES, feature_frame, validate_candles

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', required=True)
    parser.add_argument('--csv', required=True)
    args = parser.parse_args()
    bundle = joblib.load(args.artifact)
    if bundle['feature_order'] != FEATURES:
        raise ValueError('Feature contract mismatch')
    frame, _ = validate_candles(pd.read_csv(args.csv))
    latest = feature_frame(frame).iloc[[-1]]
    if latest[FEATURES].isna().any().any():
        raise ValueError('Latest source candle lacks a complete feature window')
    predicted_return = float(bundle['pipeline'].predict(latest[FEATURES])[0])
    print(json.dumps({'model_version': bundle['version'], 'source_time': int(latest.source_time.iloc[0]),
                      'predicted_return': predicted_return, 'predicted_close': float(latest.close.iloc[0] * (1 + predicted_return)),
                      'status': 'offline_research_only'}))
