"""Synthetic fixture tests only; actual research requires the validated real manifest."""
import unittest
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits
from multihorizon.data import validate_candles
from multihorizon.objective_features import objective_features, objective_targets, feature_columns, OBJECTIVE_FEATURE_VERSION
from multihorizon.objective_statistics import (direction_metrics, calibrate_temperature, apply_temperature,
    volatility_metrics, volatility_interval, conformal_radius, paired_evidence)
from multihorizon.objective_models import (direction_model, export_direction, predict_direction,
    fit_volatility, export_volatility, predict_volatility, predict_volatility_model)
from multihorizon.objective_research import PROTOCOL, folds, training_rows, trial_matrix
from test_multihorizon_data import candles
import json


class ObjectiveTests(unittest.TestCase):
    def test_direction_and_realized_variance_targets_use_exact_future_minutes(self):
        frame = validate_candles(candles(1800))
        for h in (1, 15, 60):
            target = objective_targets(frame, h)
            t = 1500
            future = np.diff(np.log(frame.close.iloc[t:t+h+1]))
            self.assertAlmostEqual(target['return'].iloc[t], future.sum())
            self.assertAlmostEqual(target.variance.iloc[t], np.sum(future**2))
            self.assertEqual(target.target_time.iloc[t]-target.source_time.iloc[t], h*60000)
            self.assertTrue(target.variance.iloc[-h:].isna().all())
            old_threshold = target.neutral_threshold.iloc[t]
            changed = frame.copy()
            changed.loc[t+1:, 'close'] *= 2
            self.assertEqual(objective_targets(changed, h).neutral_threshold.iloc[t], old_threshold)

    def test_rich_features_past_only_cross_asset_lag_and_bounded_history(self):
        frame = validate_candles(candles(2200))
        peer = frame.copy()
        rich, groups = objective_features(frame, 'SOLUSDT', {'BTCUSDT': peer, 'ETHUSDT': peer})
        altered = peer.copy()
        altered.loc[1800:, 'close'] *= 3
        changed, _ = objective_features(frame, 'SOLUSDT', {'BTCUSDT': altered, 'ETHUSDT': peer})
        np.testing.assert_allclose(rich.iloc[:1801], changed.iloc[:1801], equal_nan=True)
        tail, _ = objective_features(frame.iloc[-1536:], 'SOLUSDT', {'BTCUSDT': peer.iloc[-1536:], 'ETHUSDT': peer.iloc[-1536:]})
        np.testing.assert_allclose(rich.iloc[-1], tail.iloc[-1], atol=1e-10)
        keep = feature_columns(rich, groups, removed='cross_asset')
        self.assertFalse(set(keep) & set(groups['cross_asset']))

    def test_temperature_calibration_uses_separate_labels_and_improves_miscalibration(self):
        y = np.tile([0, 1, 1, 1], 250)
        raw = np.tile([.01, .99], (len(y), 1))
        temperature = calibrate_temperature(raw, y)
        adjusted = apply_temperature(raw, temperature)
        before, _ = direction_metrics(y, raw)
        after, _ = direction_metrics(y, adjusted)
        self.assertGreater(temperature, 1)
        self.assertLess(after['logLoss'], before['logLoss'])
        self.assertLess(after['ece'], before['ece'])
        np.testing.assert_allclose(adjusted.sum(axis=1), 1)

    def test_calibration_and_validation_boundaries_purge_overlapping_labels(self):
        protocol = json.loads(PROTOCOL.read_text(encoding='utf-8'))
        source = np.arange(365*1440, dtype=np.int64)*60000+1761955259999
        target = pd.DataFrame({'source_time': source, 'target_time': source+3600000})
        valid = np.ones(len(source), dtype=bool)
        trial = {'algorithm': 'logistic', 'rows': 12000, 'days': 90}
        for fold in folds(target, valid, protocol, 60):
            train = training_rows(target, valid, fold, trial)
            self.assertLess(target.target_time.iloc[train].max(), target.source_time.iloc[fold['calibration']].min())
            self.assertLess(target.target_time.iloc[fold['calibration']].max(), target.source_time.iloc[fold['validation']].min())
            self.assertTrue((np.diff(source[fold['validation']]) >= 3600000).all())
        self.assertEqual(len(trial_matrix(protocol)), 32)

    def test_probabilistic_families_portable_parity_including_three_class_and_lstm(self):
        rng = np.random.default_rng(42)
        columns = [f'test_feature_{i}' for i in range(6)]
        x = rng.normal(size=(1400, len(columns))).astype(np.float32)
        y = np.digitize(x[:, 0]+rng.normal(size=len(x)), [-.5, .5])
        with threadpool_limits(limits=1):
            for algorithm in ('logistic', 'random_forest', 'lightgbm', 'xgboost', 'lstm'):
                with self.subTest(algorithm=algorithm):
                    trial = {'algorithm': algorithm, 'C': .1, 'trees': 8, 'epochs': 1}
                    inputs = np.repeat(x[:, None], 16, axis=1) if algorithm == 'lstm' else x
                    model = direction_model(trial, 3).fit(inputs[:1000], y[:1000])
                    temperature = calibrate_temperature(model.predict_proba(inputs[1000:1200]), y[1000:1200])
                    artifact = export_direction(model, trial, columns, inputs[1200:], temperature)
                    actual = predict_direction(artifact, inputs[1200:])
                    np.testing.assert_allclose(actual, apply_temperature(model.predict_proba(inputs[1200:]), temperature), atol=2e-6)

    def test_volatility_qlike_zero_realizations_intervals_and_portable_models(self):
        rng = np.random.default_rng(12)
        x = rng.normal(size=(1200, 6)).astype(np.float32)
        y = np.exp(x[:, 0]*.3-10+rng.normal(size=len(x)))
        columns = [f'test_feature_{i}' for i in range(6)]
        with threadpool_limits(limits=1):
            for algorithm in ('har_rv', 'lightgbm', 'xgboost'):
                trial = {'algorithm': algorithm, 'trees': 8}
                model, smear = fit_volatility(trial, x[:1000], y[:1000])
                artifact = export_volatility(model, trial, columns, x[1000:], smear)
                np.testing.assert_allclose(predict_volatility(artifact, x[1000:]), predict_volatility_model(model, smear, x[1000:]), atol=1e-7)
        score, loss = volatility_metrics([0., .001], [.0001, .001])
        self.assertTrue(np.isfinite(loss).all())
        radius = conformal_radius(y[:1000], np.full(1000, y[:1000].mean()))
        lower, upper = volatility_interval(np.full(200, y[:1000].mean()), radius)
        self.assertTrue((lower <= upper).all())
        with self.assertRaises(ValueError):
            volatility_metrics([0.], [0.])

    def test_uncertainty_counts_all_trials_and_preserves_daily_dependence(self):
        times = np.repeat(np.arange(84)*86400000, 4)
        evidence = paired_evidence(times, np.ones(len(times)), np.full(len(times), .8), 912)
        self.assertEqual(evidence['familySize'], 912)
        self.assertEqual(evidence['movingBlockDays'], 7)
        self.assertGreater(evidence['simultaneousLowerImprovement'], 0)
