"""Synthetic candles are confined to tests; production fitting requires manifests."""
import unittest
import numpy as np
import pandas as pd
from multihorizon.data import COLUMNS, validate_candles, resample


def candles(rows=240):
    origin = 1_761_955_200_000_000
    return pd.DataFrame([[origin+i*60_000_000, 100+i*.01, 102+i*.01, 98+i*.01,
        101+i*.01, 10, origin+(i+1)*60_000_000-1, 1000, 20, 5, 500, 0]
        for i in range(rows)], columns=COLUMNS)


class DataTests(unittest.TestCase):
    def test_microseconds_normalized_to_utc(self):
        frame = validate_candles(candles())
        self.assertEqual(frame.open_time.iloc[0], 1761955200000)
        self.assertEqual(str(frame.time.dt.tz), 'UTC')
        self.assertEqual(frame.close_time.iloc[0]-frame.open_time.iloc[0], 59999)

    def test_rejects_units_gaps_duplicates_order_prices_activity_and_completion(self):
        for column, index, value in [('open_time', 1, 1), ('open_time', 1, 1761955200000000),
            ('close_time', 1, 1761955320000000), ('open', 1, 0), ('high', 1, 1),
            ('low', 1, 10000), ('volume', 1, -1), ('trades', 1, 1.5),
            ('quote_volume', 1, np.nan), ('close', 1, np.inf), ('taker_base', 1, 30)]:
            with self.subTest(column=column, value=value):
                frame = candles()
                frame[column] = frame[column].astype(float)
                frame.loc[index, column] = value
                with self.assertRaises(ValueError):
                    validate_candles(frame)
        with self.assertRaisesRegex(ValueError, 'gap'):
            validate_candles(candles().drop(index=5))
        with self.assertRaisesRegex(ValueError, 'unfinished'):
            validate_candles(candles(), now_ms=1761955200000)

    def test_resampling_preserves_ohlcv_and_rejects_partial_or_missing_bins(self):
        frame = validate_candles(candles())
        result = resample(frame, 15)
        self.assertEqual(len(result), 16)
        self.assertEqual(result.volume.iloc[0], 150)
        self.assertEqual(result.close.iloc[0], frame.close.iloc[14])
        for invalid in (frame.iloc[1:], frame.drop(index=8)):
            with self.assertRaises(ValueError):
                resample(invalid, 15)
