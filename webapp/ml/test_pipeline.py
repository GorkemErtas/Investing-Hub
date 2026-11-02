import unittest

import numpy as np
import pandas as pd

from features import DAY_MS, FEATURES, feature_frame, prepare, validate_candles


def candles(n=700):
    time = np.arange(n) * DAY_MS + 1577836800000
    close = 100 + np.arange(n) * 0.1 + np.sin(np.arange(n))
    return pd.DataFrame({'open_time': time, 'open': close - 0.1, 'high': close + 1,
                         'low': close - 1, 'close': close, 'volume': 100 + np.arange(n),
                         'close_time': time + DAY_MS - 1})


class PipelineTests(unittest.TestCase):
    def test_features_do_not_change_when_future_is_modified(self):
        raw = candles()
        original = feature_frame(validate_candles(raw)[0])
        changed = raw.copy()
        changed.loc[501:, ['open', 'high', 'low', 'close']] *= 1.1
        modified = feature_frame(validate_candles(changed)[0])
        pd.testing.assert_frame_equal(original.loc[:500, FEATURES], modified.loc[:500, FEATURES])

    def test_target_is_exact_next_daily_return(self):
        raw = candles()
        data, _ = prepare(raw)
        i = data.index[0]
        self.assertAlmostEqual(data.loc[i, 'target'], raw.close.iloc[i + 1] / raw.close.iloc[i] - 1)
        self.assertEqual(data.loc[i, 'target_time'], raw.close_time.iloc[i + 1])

    def test_gap_never_creates_cross_gap_targets_or_features(self):
        raw = candles().drop(index=350)
        data, quality = prepare(raw)
        missing_open = candles().open_time.iloc[350]
        self.assertEqual(quality['gap_boundaries'], 1)
        self.assertNotIn(missing_open + DAY_MS - 1, data.target_time.values)
        self.assertNotIn(missing_open - 1, data.source_time.values)
        self.assertFalse(((data.source_time >= missing_open) & (data.source_time < missing_open + DAY_MS * 14)).any())

    def test_duplicate_invalid_range_negative_volume_and_nonfinite_rejected(self):
        raw = candles()
        for column, value in [('open_time', raw.open_time.iloc[1]), ('high', 1), ('volume', -1), ('close', np.nan)]:
            broken = raw.copy()
            broken.loc[0, column] = value
            with self.assertRaises(ValueError):
                validate_candles(broken)

    def test_utc_daily_boundaries_and_completion_required(self):
        raw = candles()
        raw.loc[0, 'open_time'] += 1
        with self.assertRaises(ValueError):
            validate_candles(raw)
        raw = candles()
        raw.loc[len(raw) - 1, 'close_time'] = 9999999999999
        with self.assertRaises(ValueError):
            validate_candles(raw)

    def test_latest_feature_row_is_available_for_offline_inference(self):
        frame, _ = validate_candles(candles())
        latest = feature_frame(frame).iloc[-1]
        self.assertFalse(latest[FEATURES].isna().any())
        self.assertTrue(pd.isna(latest.target))


if __name__ == '__main__':
    unittest.main()
