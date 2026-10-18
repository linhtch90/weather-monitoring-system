---
name: run-verification-suite
description: >-
  Use this skill when asked to verify, benchmark, load-test, or run chaos resilience
  experiments against the weather monitoring system.
---

# Running Scalability & Chaos Verification Suites

Use this runbook to verify end-to-end telemetry ingestion, 60x dynamic frequency spike scalability, and fault tolerance.

## Step 1: Ensure Backing Infrastructure is Healthy

1. Start Docker backing containers (RabbitMQ, TimescaleDB, Redis, Prometheus):
   ```bash
   docker compose up -d
   ```
2. Verify all containers report healthy status:
   ```bash
   docker compose ps
   ```

## Step 2: Ensure Microservices Are Running

Confirm the core microservices are active:
- `station-service`: gRPC `:50051` (`npm run start:station:dev`)
- `ingestion-service`: HTTP `:3000` & gRPC `:50052` (`npm run start:ingestion:dev`)
- `processing-service`: RabbitMQ consumer (`npm run start:processing:dev`)
- `alerting-service`: Anomaly consumer (`npm run start:alerting:dev`)

Check ingestion gateway health probe:
```bash
curl -f http://localhost:3000/health
```

## Step 3: Run Chaos & Resiliency Suite

Execute the automated chaos test runner:
```bash
bash test/chaos/run-chaos-suite.sh
```
- **`test/chaos/test-circuit-breaker.js`**: Confirms `StationGrpcClient` trips its Opossum circuit breaker and falls back gracefully without 500 errors if `station-service` is down.
- **`test/chaos/test-dlq-poison-pill.js`**: Confirms out-of-range or malformed payloads are rejected and isolated without crashing consumers.

## Step 4: Run k6 Scalability & Dynamic Spike Tests

1. **60x Dynamic Frequency Surge Test** (simulates storm front shifting stations to 1s intervals up to 1,200 req/s):
   ```bash
   npm run test:k6:spike
   ```
   *Pass criteria*: `p(95) < 50ms`, `p(99) < 150ms`, `http_req_failed < 0.1%`.
2. **Fleet Growth Test** (ramps simulated stations up to 5,000 VUs):
   ```bash
   npm run test:k6:growth
   ```
