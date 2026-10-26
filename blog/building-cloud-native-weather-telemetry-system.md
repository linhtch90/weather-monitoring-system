---
title: "Designing a Cloud-Native Weather Telemetry System: Handling 60x Storm Traffic Spikes with NestJS, gRPC, RabbitMQ & TimescaleDB"
published: false
description: "How we architected a 100% open-source microservices pipeline to survive sudden 60x IoT traffic bursts using hybrid persistence, Opossum circuit breakers, and event-driven backpressure."
tags: [architecture, microservices, nodejs, typescript]
cover_image: "https://raw.githubusercontent.com/linhtch90/weather-monitoring-system/main/prompt/system-architecture-diagram.svg"
---

Most IoT tutorials assume a flat, predictable stream of sensor data: *1,000 devices sending 1 payload per minute*. In the real world, weather telemetry behaves nothing like that.

During calm weather, thousands of remote monitoring stations report once every **60 seconds**. The moment a storm front or rapid barometric pressure drop hits ($\Delta P > 3\text{ hPa} / 3\text{h}$), scientists and automated control loops command those stations to switch to **1-second high-resolution sampling**. Overnight, your ingestion pipeline faces an immediate **60x traffic explosion**—right when losing data is least acceptable.

In this post, I’ll walk through how we designed and built the **[Cloud-Native Weather Telemetry Monitoring System](https://github.com/linhtch90/weather-monitoring-system)**—a 100% open-source microservices platform built with **Node.js, TypeScript, NestJS, gRPC, RabbitMQ, TimescaleDB, and Redis**—and the engineering trade-offs we made to guarantee scalability, availability, and chaos resilience.

---

## 1. The Core Requirements vs. Architectural Decisions

Before writing a single line of code, we mapped out five non-negotiable domain requirements and paired each with a specific architectural pattern:

| Domain Requirement | The Engineering Challenge | Our Architectural Solution |
| :--- | :--- | :--- |
| **Dynamic 60x Traffic Surges** | Stations shift from `1 req/60s` to `1 req/1s` during severe weather, overwhelming synchronous DB writes. | **Queue-Decoupled Ingestion + Micro-Batching**: Gateway offloads to RabbitMQ in `< 15ms`; workers flush 500-row batches every `250ms` to TimescaleDB. |
| **Dual Communication Needs** | Some calls need instant validation (`ValidateStation`), while telemetry streams need buffered throughput. | **gRPC + RabbitMQ Hybrid**: Direct HTTP/2 binary Protobuf (**gRPC**) for synchronous RPCs; **RabbitMQ** topic exchanges for async telemetry streams. |
| **Diverse Edge Hardware** | Modern stations support HTTP/2 gRPC streams; constrained cellular/satellite IoT devices only speak HTTP/1.1 JSON. | **Multi-Protocol Hybrid Gateway**: A single NestJS `IngestionController` exposing both `:50052` (gRPC) and `:3000` (REST) backed by the same domain service. |
| **Zero Cascading Failures** | If `station-service` or Postgres slows down during a storm, the ingestion gateway must not drop incoming station packets. | **Opossum Circuit Breakers + Redis Cache-Aside**: 5-minute TTL Redis token cache + circuit breaker fallback that accepts format-valid station payloads in degraded mode. |
| **100% Open-Source Stack** | Zero vendor lock-in; runnable on any laptop via Docker Compose or scaled on Kubernetes. | **NestJS, RabbitMQ, TimescaleDB (PostgreSQL 16), Redis, Prometheus, KEDA, and Grafana k6**. |

---

## 2. High-Level System Architecture

![System Architecture Diagram](https://raw.githubusercontent.com/linhtch90/weather-monitoring-system/main/prompt/system-architecture-diagram.svg)

> **Tip — Diagram as Code**: Rather than drawing static diagrams in external tools that quickly go stale, we maintain a declarative **PlantUML** architecture specification (`prompt/system-architecture-diagram.puml`) that renders our architecture SVG directly from code (`npm run diagram:generate`). Whenever a queue or service changes, we update the `.puml` file and regenerate the vector diagram in Git.

The system is structured as a **NestJS Monorepo** divided into four strictly isolated microservices (`apps/*`) and three shared libraries (`libs/*`):

1. **`ingestion-service` (`:3000` HTTP / `:50052` gRPC)**: The ultra-fast front door. Validates physical sensor ranges, checks station credentials via Redis/gRPC, and publishes to RabbitMQ with Publisher Confirms.
2. **`station-service` (`:50051` gRPC)**: The source of truth for station metadata, coordinates, and active sampling intervals stored in PostgreSQL.
3. **`processing-service` (RabbitMQ Worker)**: Consumes raw telemetry with `prefetch: 200`, evaluates sliding-window meteorological anomalies, and bulk-inserts micro-batches into TimescaleDB hypertables.
4. **`alerting-service` (RabbitMQ Worker + gRPC Client)**: Listens for `weather.anomaly.detected` events and dispatches direct gRPC `UpdateReportingFrequency(1s)` commands back to `station-service`.

---

## 3. Deep Dive: Key Engineering Best Practices

### 3.1 Dual Communication: Why Both gRPC and RabbitMQ?

A common microservice anti-pattern is forcing *all* inter-service communication through a single hammer—either making everything an HTTP/gRPC call (creating brittle synchronous chains) or making everything an async event (turning simple queries into complex correlation-ID state machines).

We split communication by intent:

* **Direct Synchronous (gRPC with Proto3)**: When `ingestion-service` experiences a Redis cache miss for `station:ST-ALPS-001:valid`, it needs an immediate answer from `station-service`. Using gRPC over HTTP/2 gives us strict contract enforcement (`station.proto`) and low-latency binary serialization.
* **Indirect Asynchronous (RabbitMQ AMQP 0-9-1)**: Once a telemetry payload is validated, the station shouldn't wait for analytical processing or disk indexing. `ingestion-service` publishes to `weather.telemetry.topic` with routing key `telemetry.raw.<region>.<stationId>` and immediately returns an `IngestionAck`.

```typescript
// Transport-Agnostic Controller: Exposing both gRPC and REST on the same logic
@Controller()
@UseInterceptors(LoggingInterceptor)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  // 1. gRPC Unary Endpoint (:50052)
  @GrpcMethod('WeatherIngestionService', 'SubmitTelemetry')
  async submitTelemetryGrpc(data: TelemetryPayload): Promise<IngestionAck> {
    return this.ingestionService.processTelemetry(data);
  }

  // 2. HTTP REST Gateway Fallback (:3000)
  @Post('api/v1/telemetry')
  @HttpCode(HttpStatus.OK)
  async submitTelemetryHttp(@Body() body: TelemetryPayload): Promise<IngestionAck> {
    return this.ingestionService.processTelemetry(body);
  }
}
```

---

### 3.2 The Hybrid Persistence Strategy: TypeORM vs. Raw `pg.Pool`

One of the most impactful technical choices we made was **refusing to use a single database access pattern everywhere**:

1. **Relational Metadata (`station-service`) $\rightarrow$ TypeORM**:
   Station registry queries (`findById`, `updateInterval`) are low-frequency relational operations. Here, **TypeORM** (`DataSource` and `Repository<StationRecord>`) gives us clean `@Entity('stations')` decorators, type safety, and maintainable schema evolution.
2. **Time-Series Telemetry (`processing-service`) $\rightarrow$ Raw `pg.Pool` Micro-Batches**:
   During a 60x storm surge, `processing-service` commits **500 rows every 250ms** into our TimescaleDB hypertable (`weather_metrics`). Using an ORM on this hot path would instantiate 500 class instances per batch, run reflection metadata, and trigger heavy V8 garbage collection pauses. Instead, we build a single parameterized multi-row SQL `INSERT` and stream it directly over the PostgreSQL wire protocol:

```typescript
// High-throughput parameterized multi-row INSERT in TimescaleRepository
const valueClauses: string[] = [];
const values: any[] = [];
let paramIndex = 1;

for (const item of batch) {
  const date = new Date(item.timestamp || Date.now()).toISOString();
  valueClauses.push(
    `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
  );
  values.push(
    date, item.station_id, item.temperature, item.humidity,
    item.pressure, item.wind_speed, item.wind_direction,
    item.precipitation, item.battery_voltage || 12.0
  );
}

const query = `
  INSERT INTO weather_metrics 
    (time, station_id, temperature, humidity, pressure, wind_speed, wind_direction, precipitation, battery_voltage)
  VALUES ${valueClauses.join(',\n')}
`;
await this.pool.query(query, values);
```

Combined with **TimescaleDB 1-day hypertable chunks** and **Continuous Aggregates** (`weather_hourly_summary`), historical queries over millions of rows return in milliseconds.

---

### 3.3 The Closed-Loop Dynamic Frequency Controller

How does the system react automatically when extreme weather hits?

```
[Station: 1005 hPa] ──► [ProcessingConsumer: AnomalyDetector (ΔP >= 3.0 hPa)]
                                │
                                ▼ (Publishes `weather.anomaly.detected`)
                        [AlertingConsumer]
                                │
                                ▼ (Direct gRPC: UpdateReportingFrequency)
                        [StationService: Sets interval = 1s]
```

Inside `processing-service`, the `AnomalyDetector` tracks a sliding window of barometric pressure and wind gusts per station. If pressure drops by $\ge 3.0\text{ hPa}$ or wind speed exceeds $30\text{ m/s}$, it emits a critical event to RabbitMQ. `alerting-service` consumes that event and invokes `station-service` via gRPC to shift the station's reporting interval from `60s` down to `1s`.

As the 60x wave of 1-second packets hits RabbitMQ, **KEDA (Kubernetes Event-driven Autoscaling)** monitors the `weather.raw.telemetry` queue depth (`queueLength > 500`) and horizontally scales `processing-service` pods from 2 to 20 replicas.

---

### 3.4 Designing for Failure: Circuit Breakers, Backpressure & Poison Pills

A cloud-native system is only as good as its worst failure mode. We baked in four layers of defense:

1. **Opossum Circuit Breakers on gRPC**:
   Every gRPC call from `ingestion-service` to `station-service` is wrapped in an **Opossum circuit breaker** (`timeout: 2000ms`, `errorThresholdPercentage: 50%`, `resetTimeout: 5000ms`). If `station-service` crashes, the circuit trips to `OPEN` and immediately executes a fallback handler that validates the station ID format (`/^ST-[A-Z0-9-]+$/`) and accepts the telemetry in degraded mode—resulting in **zero client timeouts or HTTP 500 errors**.
2. **RabbitMQ Publisher Confirms & Consumer Prefetch**:
   `ingestion-service` uses AMQP `ConfirmChannel` so a station only receives an `ACK` once the broker confirms persistence. Downstream, `processing-service` sets `channel.prefetch(200)` and `noAck: false`, guaranteeing that a slow database never causes out-of-memory crashes in Node.js workers.
3. **Dead Letter Exchanges (DLX / DLQ)**:
   If a malfunctioning sensor sends corrupted JSON or unprocessable frames ("poison pills"), `processing-service` rejects the message with `channel.nack(msg, false, false)`, routing it straight to `weather.telemetry.dlq` so it never blocks healthy telemetry.
4. **Power-Aware Telemetry (`battery_voltage`)**:
   Remote alpine and buoy stations run on solar-charged batteries. Because 1-second burst mode drastically increases radio transmission power draw, every telemetry frame includes `battery_voltage` so operators can monitor discharge curves and prevent stations from going dark mid-storm.

---

## 4. Proving It Works: Load Testing (k6) & Chaos Engineering

Claims about scalability and resilience mean nothing without automated verification. We built two dedicated test suites into the repository:

### 1. 60x Dynamic Spike Simulation (`test/k6/scenarios/dynamic-frequency-spike.js`)
Using **Grafana k6**'s `ramping-arrival-rate` executor, we simulate calm baseline traffic (`20 req/s`), ramp to a `600 req/s` storm front, sustain a **60x burst (`1,200 req/s`)**, and recover—enforcing strict SLO thresholds:
* `p(95) < 50ms` and `p(99) < 150ms` ingestion latency
* `< 0.1%` error rate

### 2. Automated Chaos Suite (`test/chaos/run-chaos-suite.sh`)
* **Circuit Breaker Chaos Test**: Floods the gateway while `station-service` is offline, verifying seamless fallback responses.
* **Poison Pill DLQ Test**: Injects impossible physical readings (e.g., `-500°C` temperature, `150%` humidity, missing `station_id`) and verifies ingress rejection and DLQ isolation.

---

## 5. Bonus: AI-Native Repository Ergonomics (`AGENTS.md` & `.agents/skills`)

Because we built and evolved this system alongside AI coding agents, we structured the repository with first-class **AI Agent Customizations**:
* **[`AGENTS.md`](https://github.com/linhtch90/weather-monitoring-system/blob/main/AGENTS.md)**: Always-on architectural guardrails (enforcing monorepo isolation between `apps/*`, mandatory circuit breakers on gRPC, and hybrid persistence rules).
* **[`.agents/skills/`](https://github.com/linhtch90/weather-monitoring-system/tree/main/.agents/skills)**: On-demand runbooks (`update-grpc-contract`, `scaffold-microservice`, `run-verification-suite`) so any developer or AI assistant can extend `.proto` contracts or run the chaos suite with zero guesswork.

---

## Try It Yourself!

The entire project is open-source and boots locally in minutes with Docker Compose:

```bash
git clone git@github.com:linhtch90/weather-monitoring-system.git
cd weather-monitoring-system
npm install
docker compose up -d

# Start the 4 microservices in watch mode:
npm run start:station:dev
npm run start:ingestion:dev
npm run start:processing:dev
npm run start:alerting:dev
```

🔗 **GitHub Repository**: [linhtch90/weather-monitoring-system](https://github.com/linhtch90/weather-monitoring-system)

What patterns do you use to handle sudden IoT traffic spikes or hybrid SQL/Time-Series workloads? Let’s discuss in the comments!
