# Phase 3 Prompt: Processing Engine, TimescaleDB Persistence & Dynamic Frequency Adjustments

> **Execution Goal**: Build the Processing & Analytics consumer service, configure TimescaleDB hypertables with high-throughput micro-batching, implement meteorological anomaly detection, and automate dynamic reporting frequency adjustments via gRPC.

---

## Task Overview

Implement the analytical core of the system:
1. **Consumer Pipeline**: Consume raw telemetry from RabbitMQ with backpressure controls (`prefetch`, manual ACK).
2. **Time-Series Storage**: Persist high-volume metrics into **TimescaleDB** using hypertable chunking and micro-batch writes.
3. **Dynamic Frequency Control**: Detect severe weather events (e.g., sudden barometric drops, hurricane gusts) and automatically command `station-service` via direct gRPC to dynamically accelerate station sampling rates (e.g., 60s -> 1s).

---

## Detailed Requirements

### 1. TimescaleDB Schema & Hypertable (`database/timescale/init.sql`)
- Install and enable TimescaleDB extension:
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
  ```
- Table: `weather_metrics`
  - Columns: `time TIMESTAMPTZ NOT NULL`, `station_id VARCHAR(64) NOT NULL`, `temperature REAL`, `humidity REAL`, `pressure REAL`, `wind_speed REAL`, `wind_direction SMALLINT`, `precipitation REAL`, `battery_voltage REAL`.
  - Primary Key / Index: Composite index on `(station_id, time DESC)`.
- Convert into Hypertable:
  ```sql
  SELECT create_hypertable('weather_metrics', 'time', chunk_time_interval => INTERVAL '1 day');
  ```
- Compression Policy: Enable native Timescale compression for chunks older than 7 days.
- Continuous Aggregate:
  - Hourly rollups (`weather_hourly_summary`) calculating `avg_temp`, `min_temp`, `max_temp`, `avg_pressure`, `max_wind_speed`, `total_precipitation`.

### 2. Processing & Analytics Service (`apps/processing-service`)
- **RabbitMQ Consumer**:
  - Bound to `weather.raw.telemetry` queue.
  - Queue configuration: `durable: true`, `prefetch: 200`, `noAck: false`.
- **Micro-Batch Buffering Strategy**:
  - Do NOT issue single-row `INSERT` for each message.
  - Maintain an in-memory queue buffer flushing every **250ms** or when buffer reaches **500 records** (whichever occurs first).
  - Bulk write to PostgreSQL using parameterized batch queries or `pg-copy-streams`.
  - Execute `channel.ack(msg)` only after batch write commits successfully.
  - On DB write failure: retry with exponential backoff; if repeated failure, route to DLQ and do not drop uncommitted batches.

### 3. Anomaly Detection & Dynamic Frequency Control Loop
- **Meteorological Triggers**:
  - **Severe Pressure Drop**: Barometric pressure drop $> 3 \text{ hPa}$ within a 3-hour moving window (indicative of a cyclone or sudden storm front).
  - **Extreme Wind Gust**: Sustained wind speed $> 30 \text{ m/s}$.
  - **Extreme Temperature Spike**: Exceeding historic standard deviation by $3\sigma$.
- **Dynamic Control Flow**:
  1. Processing service detects an anomaly condition for a given station or geographic cluster.
  2. Processing service dispatches event `weather.anomaly.detected` to RabbitMQ.
  3. `alerting-service` consumes the anomaly event.
  4. `alerting-service` calls `station-service.UpdateReportingFrequency(station_id, frequency_seconds: 1, reason: "EXTREME_WEATHER_EVENT")` via direct **gRPC**.
  5. Station Service notifies edge clients (via WebSocket / MQTT / polling config update) to shift from 60-second intervals to 1-second intervals.
  6. When weather normalizes (no anomaly for 15 minutes), revert frequency back to 60 seconds.

---

## Deliverables & Verification Steps
1. TimescaleDB hypertable initialized and verifying chunk creation.
2. Processing Service ingesting from RabbitMQ and writing micro-batches into TimescaleDB without blocking event loop.
3. Simulate sudden pressure drop in test payload:
   - Verify `weather.anomaly.detected` message is published.
   - Verify `station-service` gRPC receives `UpdateReportingFrequency` call setting frequency to 1 second.
4. Verify query performance against TimescaleDB continuous aggregates.
