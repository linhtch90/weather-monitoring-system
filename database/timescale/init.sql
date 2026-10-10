-- Enable TimescaleDB Extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. Relational Table: Weather Stations Metadata
CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    elevation REAL DEFAULT 0.0,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    reporting_interval_seconds INT NOT NULL DEFAULT 60,
    api_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Baseline Monitoring Stations
INSERT INTO stations (id, name, latitude, longitude, elevation, status, reporting_interval_seconds, api_key)
VALUES 
    ('ST-ALPS-001', 'Alpine High Peak Station', 45.8326, 6.8652, 3842.0, 'ACTIVE', 60, 'sec_token_alps_001'),
    ('ST-PACIFIC-002', 'Coastal Pacific Buoy', 36.7783, -122.4194, 0.0, 'ACTIVE', 60, 'sec_token_pacific_002'),
    ('ST-SAHARA-003', 'North Sahara Outpost', 25.2867, 14.4326, 450.0, 'ACTIVE', 60, 'sec_token_sahara_003')
ON CONFLICT (id) DO NOTHING;

-- 2. Time-Series Hypertable: Raw Weather Metrics
CREATE TABLE IF NOT EXISTS weather_metrics (
    time TIMESTAMPTZ NOT NULL,
    station_id VARCHAR(64) NOT NULL,
    temperature REAL,
    humidity REAL,
    pressure REAL,
    wind_speed REAL,
    wind_direction SMALLINT,
    precipitation REAL,
    battery_voltage REAL
);

-- Composite Index for fast time-range lookups by station
CREATE INDEX IF NOT EXISTS idx_weather_station_time ON weather_metrics (station_id, time DESC);

-- Convert to Timescale Hypertable with 1-day chunks
SELECT create_hypertable('weather_metrics', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- 3. Continuous Aggregate: Hourly Weather Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS weather_hourly_summary
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    station_id,
    AVG(temperature) AS avg_temp,
    MIN(temperature) AS min_temp,
    MAX(temperature) AS max_temp,
    AVG(humidity) AS avg_humidity,
    AVG(pressure) AS avg_pressure,
    MIN(pressure) AS min_pressure,
    MAX(wind_speed) AS max_wind_speed,
    SUM(precipitation) AS total_rain
FROM weather_metrics
GROUP BY bucket, station_id
WITH NO DATA;

-- Refresh policy for Continuous Aggregate (hourly)
SELECT add_continuous_aggregate_policy('weather_hourly_summary',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);
