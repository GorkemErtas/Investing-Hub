# Offline daily forecasting experiment

Binance Vision historical data; noncommercial research. Derived results licensed CC BY-NC-SA 4.0.

| Pair    | Best validation candidate | Validation return RMSE | No-change RMSE | Walk-forward wins | Selected  | Test price RMSE (USDT) | Status                            |
| ------- | ------------------------- | ---------------------- | -------------- | ----------------- | --------- | ---------------------- | --------------------------------- |
| BTCUSDT | gradient_boosting         | 0.027481               | 0.027789       | 2/4               | no_change | 2130.97                | disabled_no_validated_improvement |
| ETHUSDT | gradient_boosting         | 0.033667               | 0.033942       | 3/4               | no_change | 119.42                 | disabled_no_validated_improvement |

The final chronological test is evaluated only for the selected approach and the no-change baseline. No forecast is deployed. Full metrics, split boundaries, seeds, archive hashes and environment versions are in latest.json.

Candidate selection requires 2% validation return-RMSE improvement and at least 3 of 4 walk-forward wins. An eligible candidate still requires manual held-out review. No simulated trading returns are claimed.
