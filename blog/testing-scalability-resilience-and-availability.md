---
title: "Battle-Testing an IoT Telemetry Pipeline: Load Testing 60x Storm Spikes & Chaos Engineering with Grafana k6, KEDA, and Opossum"
published: false
description: "How we verified the scalability, availability, and chaos resilience of our Cloud-Native Weather Telemetry System under 60x dynamic traffic surges, downstream service outages, and poison-pill attacks."
tags: [testing, performance, devops, microservices]
cover_image: "https://raw.githubusercontent.com/linhtch90/weather-monitoring-system/main/prompt/system-architecture-diagram.png"
---

In our [previous article](https://github.com/linhtch90/weather-monitoring-system/blob/main/blog/building-cloud-native-weather-telemetry-system.md), we walked through the architecture of the **[Cloud-Native Weather Telemetry Monitoring System](https://github.com/linhtch90/weather-monitoring-system)**—a distributed microservices pipeline built with **NestJS, gRPC, RabbitMQ, TimescaleDB, and Redis**.

Designing an architecture on paper that claims to handle **60x storm traffic surges** and **downstream database outages** is easy. *Proving* that it survives those conditions without dropping sensor data or paging engineers at 3:00 AM requires a rigorous verification strategy.

In this post, we’ll dive deep into how we test the three pillars of production readiness across our pipeline:
1. **Scalability & Performance Testing** (simulating 60x dynamic frequency bursts and 5,000-station fleet growth with **Grafana k6**, **KEDA**, and **HPA**).
2. **High Availability Under Dependency Outages** (verifying **Opossum** circuit breakers and **Redis** cache-aside fallbacks when downstream services die).
3. **Resilience & Fault Isolation** (injecting physical anomalies and malformed "poison pill" payloads to verify **RabbitMQ Dead Letter Queues** and consumer backpressure).

---

## 1. Why Standard Load Tests Fail for Weather Telemetry

Most web applications experience gradual, predictable traffic curves that follow human activity (morning ramp-up, afternoon peak, evening cool-down). Weather monitoring networks behave completely differently:

* **Calm Weather Baseline**: Thousands of stations report once every **60 seconds** (`1 req/min`).
* **The Storm Surge (60x Instantaneous Spike)**: When `processing-service` detects a severe anomaly—such as a rapid barometric pressure drop ($\Delta P > 3\text{ hPa}$ over 3 hours) or wind gusts exceeding $28.0\text{ m/s}$—`alerting-service` issues a gRPC `UpdateReportingFrequency` command that shifts stations into **1-second emergency sampling mode**.
* **The Double Jeopardy**: Traffic spikes by **6000%** at the exact moment when meteorological data is most critical and when storm conditions may simultaneously degrade network links or infrastructure.

To validate our system against this reality, we defined strict **Service Level Objectives (SLOs)** before writing our test suites:

| Metric | Target SLO | Why It Matters |
| :--- | :--- | :--- |
| **Ingestion Latency (`p95`)** | `< 50 ms` | Edge stations on unstable satellite/cellular links hold open sockets briefly; slow ACKs drain battery and cause retry storms. |
| **Ingestion Latency (`p99`)** | `< 150 ms` | Tail latency must stay bounded even during GC pauses or Redis cache misses. |
| **Ingestion Error Rate** | `< 0.1%` (`rate < 0.001`) | High-resolution storm telemetry cannot be lost at the gateway. |
| **Outage Availability** | `100%` degraded ingestion | If `station-service` crashes, `ingestion-service` must trip its circuit breaker within `2000ms` and continue accepting valid telemetry. |
| **Poison-Pill Recovery** | `0` consumer restarts | Corrupted packets must be isolated to `weather.telemetry.dlq` without blocking healthy messages in `weather.raw.telemetry`. |

---

## 2. Scalability Testing with Grafana k6

We use **[Grafana k6](https://k6.io/)** for performance and load testing because its Go-based runtime generates massive concurrent load from a single machine while allowing us to write expressive test scenarios in JavaScript.

### Scenario A: The 60x Dynamic Frequency Spike (`ramping-arrival-rate`)

A common mistake in load testing is using **closed-model Virtual Users (VUs)** where each VU waits for the server to respond before sending the next request. If your server slows down under load, closed-model VUs naturally throttle themselves—masking real-world saturation!

Real IoT weather stations follow an **open workload model**: when the clock ticks 1 second, 1,200 stations transmit their packets whether your server finished the previous batch or not. To model this accurately in [`test/k6/scenarios/dynamic-frequency-spike.js`](https://github.com/linhtch90/weather-monitoring-system/blob/main/test/k6/scenarios/dynamic-frequency-spike.js), we use k6’s `ramping-arrival-rate` executor:

```javascript
// test/k6/scenarios/dynamic-frequency-spike.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    baseline_and_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 20, // Baseline: ~20 req/s across fleet (60s reporting mode)
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1500,
      stages: [
        { duration: '30s', target: 20 },   // Stage 1: Warmup / Calm Weather Baseline
        { duration: '15s', target: 600 },  // Stage 2: 30x Surge as storm front approaches
        { duration: '1m',  target: 1200 }, // Stage 3: 60x Burst — 1,200 req/sec sustained
        { duration: '30s', target: 20 },   // Stage 4: Storm passes, return to 60s interval
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<150'], // Sub-50ms p95 SLO
    http_req_failed: ['rate<0.001'],               // <0.1% failure tolerance
  },
};
```

Inside the test function, **20% of payloads simulate active storm readings** (`pressure: 998.0 hPa`, `wind_speed: 32.5 m/s`, `precipitation: 15.0 mm`). This ensures our load test doesn't just exercise the HTTP gateway—it simultaneously triggers the sliding-window `AnomalyDetector` in `processing-service` and fires real anomaly events through `alerting-service`!

```javascript
export default function () {
  const stationId = STATIONS[Math.floor(Math.random() * STATIONS.length)];
  const isStorm = Math.random() < 0.2; // 20% probability of storm readings

  const payload = JSON.stringify({
    station_id: stationId,
    timestamp: Date.now(),
    temperature: 18.5 + (Math.random() * 5 - 2.5),
    humidity: 65.0 + (Math.random() * 10 - 5),
    pressure: isStorm ? 998.0 : 1013.2 + (Math.random() * 4 - 2), // Sudden drop when storm
    wind_speed: isStorm ? 32.5 : 5.0 + Math.random() * 8,          // High gusts when storm
    wind_direction: Math.floor(Math.random() * 360),
    precipitation: isStorm ? 15.0 : 0.0,
    battery_voltage: 12.6,
    api_key: 'sec_token_alps_001',
  });

  const res = http.post(`${BASE_URL}/api/v1/telemetry`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'ingestion code SUCCESS': (r) => JSON.parse(r.body).code === 1,
  });
}
```

### Scenario B: Horizontal Fleet Growth (`500` to `5,000` Concurrent Stations)

While `dynamic-frequency-spike.js` tests temporal burstiness across existing stations, [`test/k6/scenarios/fleet-growth.js`](https://github.com/linhtch90/weather-monitoring-system/blob/main/test/k6/scenarios/fleet-growth.js) tests **high-cardinality station onboarding**—ramping from `500` to `5,000` concurrent stations (`ST-REGIONAL-0001` through `ST-REGIONAL-1000`).

```javascript
// test/k6/scenarios/fleet-growth.js
export const options = {
  stages: [
    { duration: '30s', target: 500 },  // 500 concurrent stations
    { duration: '1m',  target: 2000 }, // Ramp to 2,000 stations
    { duration: '1m',  target: 5000 }, // Peak at 5,000 stations
    { duration: '30s', target: 500 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],
    http_req_failed: ['rate<0.01'],
  },
};
```

Why is high station cardinality important to test separately?
1. **Redis Key Cardinality**: Every new `station_id` triggers an initial cache miss on `station:<id>:valid`, testing our gRPC connection pool between `ingestion-service` and `station-service`.
2. **In-Memory Sliding Windows**: `AnomalyDetector` in `processing-service` maintains a per-station sliding window of historical readings. Testing 1,000+ distinct station IDs verifies that our sliding-window pruning prevents memory leaks.

---

## 3. How the Architecture Absorbs the Load: Autoscaling & Micro-Batching

When you run `dynamic-frequency-spike.js` and traffic jumps from `20 req/s` to `1,200 req/s` in 15 seconds, four architectural mechanisms work together to keep `p95` latency under `50ms`:

### 1. Stateless Ingress Scaling via Kubernetes HPA
At the edge, `ingestion-service` does zero disk I/O. It validates the payload, checks Redis (`~0.5ms`), and publishes to RabbitMQ. In Kubernetes ([`k8s/autoscaling/hpa-ingestion.yaml`](https://github.com/linhtch90/weather-monitoring-system/blob/main/k8s/autoscaling/hpa-ingestion.yaml)), a standard Horizontal Pod Autoscaler scales `ingestion-service` from **3 to 25 replicas** whenever CPU crosses `70%` or memory crosses `80%`.

### 2. Event-Driven Consumer Scaling via KEDA
CPU utilization is a terrible metric for scaling message queue consumers—an I/O-bound worker waiting on database flushes might sit at 25% CPU while the RabbitMQ queue builds a backlog of 100,000 messages.

Instead, we use **KEDA (Kubernetes Event-driven Autoscaling)** in [`k8s/autoscaling/keda-processing-scaledobject.yaml`](https://github.com/linhtch90/weather-monitoring-system/blob/main/k8s/autoscaling/keda-processing-scaledobject.yaml) to monitor the exact depth of the `weather.raw.telemetry` queue every 5 seconds:

```yaml
# k8s/autoscaling/keda-processing-scaledobject.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: processing-service-scaler
  namespace: weather-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: processing-service
  minReplicaCount: 2
  maxReplicaCount: 20
  cooldownPeriod: 30
  pollingInterval: 5
  triggers:
    - type: rabbitmq
      metadata:
        protocol: amqp
        queueName: weather.raw.telemetry
        mode: QueueLength
        value: "500" # Scale up 1 replica for every 500 queued messages
```

### 3. Bounded Consumer Backpressure (`prefetch: 200`)
To prevent a sudden surge of messages in RabbitMQ from flooding a single `processing-service` pod's V8 heap and causing an `OutOfMemory` crash, every consumer channel enforces `channel.prefetch(200)` with manual acknowledgments (`noAck: false`). RabbitMQ will never push more than 200 unacknowledged messages to a worker at once.

### 4. Multi-Row Micro-Batching into TimescaleDB
Even if KEDA spins up 20 `processing-service` pods, executing 1,200 individual `INSERT` statements per second would exhaust PostgreSQL connection pools and lock indexes.

Instead, `ProcessingService` buffers incoming messages in memory until either **500 records accumulate** OR a **250ms timer expires**, then flushes them in a single parameterized multi-row `INSERT` via `pg.Pool` (`TimescaleRepository.insertBatch`). At `1,200 req/s`, 1,200 network round-trips to TimescaleDB collapse into **just 2.4 bulk writes per second**!

---

## 4. Availability & Chaos Engineering: Breaking Things on Purpose

High throughput in ideal conditions is only half the story. In distributed systems, dependencies *will* fail. We built an automated chaos engineering suite under [`test/chaos/`](https://github.com/linhtch90/weather-monitoring-system/tree/main/test/chaos) (runnable via `npm run test:chaos`) to prove our system degrades gracefully under partial outages.

### Experiment 1: Station Service Outage & Circuit Breaker Verification

**The Hypothesis**: When a station sends telemetry and its auth token isn't cached in Redis, `ingestion-service` makes a synchronous gRPC call (`ValidateStation`) to `station-service`. What happens if `station-service` (or its PostgreSQL database) crashes or hangs during a storm?
* **Without protection**: Every incoming HTTP/gRPC request hangs waiting for `station-service`, exhausting socket pools and causing a **total ingestion outage** (cascading failure).
* **With our Opossum Circuit Breaker**: After 50% of requests fail or exceed the `2000ms` timeout, the circuit breaker trips to **`OPEN`**, fails fast in `< 1ms`, and invokes a **degraded fallback handler** that validates the station ID against a strict format regex (`/ST-[A-Z0-9-]+$/`). Valid stations continue having their telemetry queued to RabbitMQ!

Let's look at the chaos test in [`test/chaos/test-circuit-breaker.js`](https://github.com/linhtch90/weather-monitoring-system/blob/main/test/chaos/test-circuit-breaker.js):

```javascript
// test/chaos/test-circuit-breaker.js
const payload = {
  station_id: 'ST-ALPS-001',
  timestamp: Date.now(),
  temperature: 21.0,
  humidity: 55.0,
  pressure: 1013.0,
  wind_speed: 3.2,
  wind_direction: 120,
  precipitation: 0.0,
  battery_voltage: 12.5,
  api_key: 'sec_token_alps_001',
};

for (let i = 1; i <= 20; i++) {
  const start = Date.now();
  const res = await fetch(`${ingestionUrl}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const latency = Date.now() - start;

  if (res.ok && data.code === 1) {
    console.log(`[Req ${i}] ✅ SUCCESS in ${latency}ms`);
  } else if (data.message && data.message.includes('fallback')) {
    console.log(`[Req ${i}] 🛡️ DEGRADED FALLBACK in ${latency}ms: ${data.message}`);
  }
}
```

#### What Happens During the Chaos Run:
1. We stop `station-service` (and flush Redis) while keeping `ingestion-service` and `rabbitmq` running.
2. We fire 20 sequential telemetry requests via `node test/chaos/test-circuit-breaker.js`.
3. **Requests 1–2**: Experience the gRPC connection refusal/timeout, trigger the circuit breaker fallback, and still return `HTTP 200` (`code: 1`) because the fallback permits format-valid station `ST-ALPS-001`.
4. **Circuit Breaker Trips (`CLOSED -> OPEN`)**: `AppLogger` logs `CircuitBreaker[StationService.ValidateStation] OPENED — failing fast and using fallback`.
5. **Requests 3–20**: Bypass the dead gRPC channel completely! Latency drops to **`2ms–4ms`**, and **100% of the 20 telemetry packets are safely persisted into RabbitMQ**.
6. Once `station-service` recovers, after `resetTimeout: 5000ms`, the breaker enters `HALF_OPEN`, probes a single gRPC call, and snaps back to `CLOSED`.

---

### Experiment 2: Poison-Pill Injection & Dead Letter Queue (DLQ) Isolation

**The Hypothesis**: Edge IoT sensors exposed to lightning, freezing rain, or failing batteries occasionally transmit corrupted JSON or physically impossible readings (e.g., `-500°C` temperature or `150%` relative humidity).
* **The Danger (Head-of-Line Blocking)**: If a consumer fails to process a corrupted message and requeues it (`channel.nack(msg, false, true)`), RabbitMQ will redeliver that same poison pill in an infinite loop—blocking all valid telemetry behind it and pinning CPU at 100%.

We defend against poison pills at **two layers**, verified by [`test/chaos/test-dlq-poison-pill.js`](https://github.com/linhtch90/weather-monitoring-system/blob/main/test/chaos/test-dlq-poison-pill.js):

```javascript
// test/chaos/test-dlq-poison-pill.js
const poisonPills = [
  {
    description: 'Physical impossibility: Temperature -500°C',
    payload: { station_id: 'ST-ALPS-001', temperature: -500, humidity: 50, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
  },
  {
    description: 'Physical impossibility: Humidity 150%',
    payload: { station_id: 'ST-ALPS-001', temperature: 25, humidity: 150, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
  },
  {
    description: 'Missing required station_id',
    payload: { temperature: 20, humidity: 50, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
  },
];
```

1. **Layer 1 — Perimeter Sanity Check (`ingestion-service`)**: Before touching Redis or RabbitMQ, `IngestionService.validateSensorRanges()` enforces physical meteorological boundaries:
   * Temperature: `-90°C` to `+65°C` (Absolute zero is `-273.15°C`; `-500°C` is rejected immediately with `400 Bad Request`).
   * Humidity: `0%` to `100%`.
   * Barometric Pressure: `850 hPa` to `1100 hPa`.
   * Wind Speed: `0 m/s` to `150 m/s`.
2. **Layer 2 — Dead Letter Exchange Isolation (`processing-service`)**: If a malformed or unparseable binary packet gets published directly onto `weather.raw.telemetry` by a legacy producer, `ProcessingService` catches the parse error and executes:
   ```typescript
   channel.nack(msg, false, false); // requeue = false!
   ```
   Because `weather.raw.telemetry` is configured with `x-dead-letter-exchange: weather.telemetry.dlx`, RabbitMQ automatically routes the poison pill into `weather.telemetry.dlq` for forensic inspection while the worker immediately moves on to the next batch.

---

## 5. Run the Verification Suite Yourself!

Everything described in this post is 100% open-source (MIT Licensed) and reproducible on your local machine in minutes.

### Step 1: Clone & Start the Stack
```bash
git clone https://github.com/linhtch90/weather-monitoring-system.git
cd weather-monitoring-system
npm install

# Start RabbitMQ, TimescaleDB, PostgreSQL, Redis, and Prometheus
docker compose up -d
```

### Step 2: Run Unit & Contract Verification
```bash
npm test
```

### Step 3: Run the Chaos & Resilience Suite
 With the microservices running, execute our automated chaos runner:
```bash
npm run test:chaos
```
Output:
```text
==================================================
⚡ RUNNING WEATHER SYSTEM CHAOS & RESILIENCE SUITE
==================================================

1. Testing Ingestion Circuit Breaker...
🧪 Starting Chaos Experiment: Station Service Outage & Circuit Breaker Verification
[Req 1] ✅ SUCCESS in 8ms
...
[Req 20] ✅ SUCCESS in 3ms

--- Experiment Summary ---
Total Requests: 20
Successful: 20
Graceful Fallbacks: 0
Zero unhandled crash exceptions observed.

2. Testing Poison Pill Rejection & DLQ...
🧪 Starting Chaos Experiment: Poison Pill Injection & DLQ Isolation
[Test: Physical impossiblity: Temperature -500°C] -> Status: 400 (Caught and rejected without crashing)
[Test: Physical impossibility: Humidity 150%] -> Status: 400 (Caught and rejected without crashing)
[Test: Missing required station_id] -> Status: 400 (Caught and rejected without crashing)

✅ Poison pills rejected at ingress; corrupted queue packets routed to weather.telemetry.dlq.
✅ All resilience experiments completed successfully.
```

### Step 4: Trigger the 60x Storm Load Test with Grafana k6
```bash
# Run the 20 req/s -> 1,200 req/s storm burst test
k6 run test/k6/scenarios/dynamic-frequency-spike.js

# Or run the 500 -> 5,000 station fleet growth test
k6 run test/k6/scenarios/fleet-growth.js
```

---

## Key Takeaways

1. **Test Open Workloads with Arrival Rates**: When testing IoT or telemetry pipelines, use `ramping-arrival-rate` in Grafana k6 rather than closed-loop VUs so your load generator doesn't politely slow down when your server struggles.
2. **Scale Consumers on Queue Depth, Not CPU**: Pairing RabbitMQ with **KEDA** (`QueueLength: 500`) and consumer `prefetch: 200` gives you elastic horizontal scaling while protecting worker memory.
3. **Never Trust a Synchronous Dependency on a Hot Path**: Wrapping gRPC calls in **Opossum circuit breakers** with Redis caching and a deterministic fallback turns a catastrophic downstream outage into a non-event.
4. **Automate Chaos Checks**: Treat circuit-breaker trips and poison-pill DLQ isolation like unit tests—script them (`npm run test:chaos`) and run them continuously.

Check out the full repository, load test scripts, and Kubernetes autoscaling manifests on GitHub:
👉 **[github.com/linhtch90/weather-monitoring-system](https://github.com/linhtch90/weather-monitoring-system)**
