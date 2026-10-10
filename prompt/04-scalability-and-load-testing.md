# Phase 4 Prompt: Scalability Testing, Dynamic Spikes & Autoscaling (k6 & KEDA)

> **Execution Goal**: Build a comprehensive load and scalability testing suite using **k6**, simulate real-world dynamic frequency spikes (1s vs 60s reporting intervals), benchmark station fleet growth, and configure Kubernetes autoscaling (HPA & KEDA).

---

## Task Overview

Weather stations produce unpredictable traffic profiles. The system must be rigorously benchmarked to prove it can scale horizontally when:
1. Scientists command high-frequency monitoring (burst from 1 req/min to 1 req/sec per station — a **60x traffic spike**).
2. The global fleet of monitoring stations expands from 1,000 to 10,000+ stations.

---

## Detailed Requirements

### 1. k6 Load Testing Suite (`test/k6/`)
Write modular k6 scripts in modern JavaScript to simulate realistic weather station behavior.

#### A. Dynamic Spike Scenario (`test/k6/scenarios/dynamic-frequency-spike.js`)
- **Stage 1 (Baseline)**: 1,000 Virtual Users (VUs) representing weather stations emitting telemetry every 60 seconds (target: ~16.6 req/sec) for 2 minutes.
- **Stage 2 (Extreme Event Triggered)**: Simulated command shifts 500 of the stations to high-frequency mode emitting telemetry every 1 second (target: ~516 req/sec, a **31x surge**) for 5 minutes.
- **Stage 3 (Full Storm Front)**: All 1,000 stations shift to 1 req/sec (target: **1,000 req/sec**, sustained for 3 minutes).
- **Stage 4 (Recovery)**: Stations revert to baseline 60-second intervals.
- **Thresholds**:
  - `http_req_duration{status:200}`: p95 < 50ms, p99 < 150ms.
  - `http_req_failed`: rate < 0.01% (zero tolerance for dropped packets).

#### B. Fleet Expansion Scenario (`test/k6/scenarios/fleet-growth.js`)
- Ramp up simulated stations from 1,000 -> 5,000 -> 10,000 concurrent clients.
- Verify Ingestion Service memory consumption and event loop lag (must remain under 20ms).

#### C. gRPC Streaming Load Script (`test/k6/scenarios/grpc-stream-load.js`)
- Use `k6/net/grpc` to establish streaming connections (`StreamTelemetry`) directly to the gRPC Ingestion endpoint.
- Compare throughput and CPU efficiency between HTTP JSON payload vs gRPC Protobuf binary payloads.

### 2. Autoscaling Architecture (KEDA & HPA)
Create Kubernetes manifests (`k8s/autoscaling/`):
- **Ingestion Service HPA**:
  - Metric: CPU utilization > 70% or incoming HTTP/gRPC request rate (`http_requests_per_second > 500`).
  - Min replicas: 3, Max replicas: 20.
- **Processing Service KEDA ScaledObject**:
  - Metric: RabbitMQ queue depth for `weather.raw.telemetry`.
  - Target queue length per replica: 500 messages.
  - Behavior: When a dynamic frequency spike hits, messages accumulate in RabbitMQ; KEDA rapidly spins up Processing Service pods from 2 to 15 replicas to drain the queue in parallel without lagging.

---

## Metrics to Track & Validate
Configure Prometheus and Grafana dashboards tracking:
1. **Ingestion Ingress Rate**: `rate(telemetry_ingested_total[1m])`
2. **RabbitMQ Buffer Depth**: `rabbitmq_queue_messages{queue="weather.raw.telemetry"}`
3. **Consumer Ingestion Rate**: `rate(telemetry_processed_total[1m])`
4. **End-to-End Latency**: Time from station emission to TimescaleDB commit (target: < 1.5 seconds during peak burst).
5. **Node.js Event Loop Lag**: Tracked via `nodejs_eventloop_lag_seconds`.

---

## Deliverables & Verification Steps
1. Executable k6 scripts with clear CLI run commands (e.g., `k6 run test/k6/scenarios/dynamic-frequency-spike.js`).
2. KEDA ScaledObject manifest files validated with `kubectl`.
3. Test report artifact summarizing p95 latency, queue drain time, and CPU utilization under 60x burst conditions.
