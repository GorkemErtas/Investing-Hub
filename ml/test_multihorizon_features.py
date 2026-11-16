import unittest
import numpy as np
from multihorizon.data import validate_candles
from multihorizon.features import features, prepare, target_time, FEATURES, HISTORY
from test_multihorizon_data import candles
from datetime import datetime, timezone


class FeatureTests(unittest.TestCase):
    def test_past_only_and_bounded_tail_parity(self):
        frame = validate_candles(candles(600))
        full = features(frame)
        changed = frame.copy()
        changed.loc[401:, 'close'] *= 2
        np.testing.assert_allclose(full.iloc[:401], features(changed).iloc[:401], equal_nan=True)
        np.testing.assert_allclose(full.iloc[-1], features(frame.iloc[-HISTORY:]).iloc[-1], atol=1e-12)
        self.assertEqual(tuple(full.columns), FEATURES)

    def test_exact_horizon_labels(self):
        frame = validate_candles(candles())
        for horizon, minutes in [('1m', 1), ('15m', 15), ('1h', 60)]:
            data, _ = prepare(frame, horizon)
            self.assertTrue(((data.target_time-data.source_time) == minutes*60000).all())
            index = frame.index[frame.close_time == data.source_time.iloc[0]][0]
            self.assertAlmostEqual(data.target.iloc[0], np.log(frame.close.iloc[index+minutes]/frame.close.iloc[index]))
        with self.assertRaisesRegex(ValueError, 'monthly'):
            prepare(frame, '1M')

    def test_case_sensitive_calendar_month(self):
        source = int(datetime(2026, 1, 31, 23, 59, 59, 999000, tzinfo=timezone.utc).timestamp()*1000)
        month = datetime.fromtimestamp(target_time(source, '1M')/1000, timezone.utc)
        self.assertEqual((month.month, month.day), (2, 28))
        self.assertEqual(target_time(source, '1m')-source, 60000)
        with self.assertRaises(ValueError):
            target_time(source, '1H')
