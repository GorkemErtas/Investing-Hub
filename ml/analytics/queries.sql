-- name: observations
-- Business question: are stored days missing, and what are consecutive returns?
WITH history AS (
 SELECT open_time, close_time, close, volume,
        LAG(close) OVER (ORDER BY open_time) previous_close,
        LAG(open_time) OVER (ORDER BY open_time) previous_open
 FROM candles WHERE symbol=:symbol
)
SELECT *, CASE WHEN open_time-previous_open=86400000 THEN close/previous_close-1 END daily_return
FROM history ORDER BY open_time DESC LIMIT 6000;

-- name: assets
-- Business question: which assets have coverage, and how many model versions?
WITH coverage AS (
 SELECT symbol, COUNT(*) rows, MIN(open_time) first_open, MAX(close_time) last_close
 FROM candles GROUP BY symbol
), versions AS (SELECT symbol, COUNT(*) models FROM models GROUP BY symbol)
SELECT coverage.*, COALESCE(versions.models,0) models
FROM coverage LEFT JOIN versions USING(symbol) ORDER BY symbol LIMIT 8;

-- name: versions
-- Business question: which frozen regression candidates exist? No artifacts.
SELECT id, status, metadata FROM models WHERE symbol=:symbol ORDER BY id LIMIT 100;

-- name: evaluated
-- Business question: which genuine prospective forecasts have observed outcomes?
SELECT p.*, json_extract(p.details,'$.model_status_at_generation') origin_status
FROM predictions p JOIN models m ON p.model_id=m.id
WHERE p.symbol=:symbol AND p.status='evaluated' AND p.target_time<:now
 AND p.source_time<p.generated_at AND p.generated_at<p.target_time
 AND p.target_time-p.source_time=86400000
 AND json_extract(m.metadata,'$.trained_at')<=p.generated_at
 AND json_extract(m.metadata,'$.training_range.target_end')<=p.source_time
ORDER BY p.target_time, p.model_id LIMIT 5000;

-- name: latest_performance
-- Business question: what is the latest cumulative performance per model?
WITH ranked AS (
 SELECT p.*, ROW_NUMBER() OVER(PARTITION BY model_id ORDER BY through_time DESC) r
 FROM performance p JOIN models m ON m.id=p.model_id WHERE m.symbol=:symbol
)
SELECT model_id, through_time, metadata FROM ranked WHERE r=1 LIMIT 100;

-- name: deterioration
-- Business question: have the latest genuine prospective errors grown?
-- Caller supplies only chronology-verified rows from the canonical forward filter.
WITH observations AS (
 SELECT json_extract(value,'$.model_id') model_id,
        CASE WHEN json_extract(json_extract(value,'$.details'),'$.model_status_at_generation')='active'
             THEN 'prospective_active' ELSE 'prospective_shadow' END phase,
        json_extract(value,'$.target_time') target_time,
        json_extract(value,'$.predicted_return')-json_extract(value,'$.actual_return') residual
 FROM json_each(:evaluated)
), ranked AS (
 SELECT *, ROW_NUMBER() OVER(PARTITION BY model_id,phase ORDER BY target_time DESC) n
 FROM observations
)
SELECT model_id, phase, SUM(CASE WHEN n<=30 THEN 1 ELSE 0 END) recent_samples,
 SUM(CASE WHEN n BETWEEN 31 AND 60 THEN 1 ELSE 0 END) previous_samples,
 AVG(CASE WHEN n<=30 THEN residual*residual END) recent_mse,
 AVG(CASE WHEN n BETWEEN 31 AND 60 THEN residual*residual END) previous_mse
FROM ranked WHERE n<=60 GROUP BY model_id,phase ORDER BY model_id,phase LIMIT 200;

-- name: anomaly_frequency
-- Business question: which observed methods/months generate the most alerts?
-- Derived event JSON is transient, not another copy of the candle database.
SELECT substr(json_extract(value,'$.time'),1,7) month,
 json_extract(value,'$.method') method, COUNT(*) flags
FROM json_each(:anomalies) GROUP BY month,method ORDER BY month,method LIMIT 1000;
