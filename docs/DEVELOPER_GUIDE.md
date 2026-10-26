# Developer Guide: Cloud-Native Weather Telemetry System

Welcome to the developer documentation for the **Cloud-Native Weather Telemetry Monitoring System**. This guide provides everything engineers need to understand the architecture, run and debug the services, modify schemas, and adhere to engineering conventions.

---

## Table of Contents
1. [Architectural Principles & Design Decisions](#1-architectural-principles--design-decisions)
2. [End-to-End System Flows](#2-end-to-end-system-flows)
3. [Monorepo Structure & Dependency Rules](#3-monorepo-structure--dependency-rules)
4. [Local Environment & Daily Workflow](#4-local-environment--daily-workflow)
5. [How to Work with the Codebase](#5-how-to-work-with-the-codebase)
6. [Practical Engineering Conventions](#6-practical-engineering-conventions)
7. [Database & Storage Administration](#7-database--storage-administration)
8. [Testing, Benchmarking & Chaos Verification](#8-testing-benchmarking--chaos-verification)
9. [Troubleshooting & FAQ](#9-troubleshooting--faq)

---

## 1. Architectural Principles & Design Decisions

### 1.1 Dual Interservice Communication Paradigms
In distributed systems, choosing the right communication style for each interaction is critical. This platform deliberately separates concerns into two distinct paradigms:

| Interaction Style | Protocol / Tech | When to Use | Example in this System |
| :--- | :--- | :--- | :--- |
| **Direct Synchronous** | **gRPC** (HTTP/2 + Proto3) | When a service requires an **immediate, blocking, transactional answer** with strict compile-time types. | `ingestion-service` calls `station-service.ValidateStation()` to verify station status and credentials before accepting telemetry. |
| **Indirect Asynchronous** | **RabbitMQ** (AMQP 0-9-1) | For **high-throughput, decoupled data streaming** where senders should not wait for downstream database commits. | `ingestion-service` offloads telemetry packets to `weather.telemetry.topic` in $< 15\text{ms}$. |

### 1.2 Coping with Dynamic Reporting Frequency (60x Traffic Spikes)
- **Normal Operations**: Edge weather stations emit metrics once every 60 seconds (1 req/min per station).
- **Severe Weather Events**: When severe meteorological conditions occur (e.g. hurricanes, flash floods, sudden barometric drops), stations are commanded to accelerate sampling up to **1 req/sec** (a **60x traffic spike**).
- **Architectural Solution**:
  1. The **Ingestion Gateway** performs minimal CPU work (range validation + cached token check) and pushes to RabbitMQ, decoupling incoming edge connections from database I/O.
  2. RabbitMQ's durable disk queues absorb the incoming traffic shock without dropping messages.
  3. The **Processing Service** consumes in **micro-batches** (500 records or 250ms flushes), minimizing database round-trips.
  4. **KEDA (Kubernetes Event-driven Autoscaling)** monitors RabbitMQ queue length and dynamically scales processing worker pods from 2 up to 20 replicas.

### 1.3 100% Open-Source Tooling
The stack uses exclusively open-source tooling without proprietary cloud lock-in:
- **Runtime**: Node.js v20+ with TypeScript (Strict mode)
- **Framework**: NestJS (monorepo architecture)
- **Message Broker**: RabbitMQ 3.13 (AMQP 0-9-1)
- **Time-Series Analytical DB**: TimescaleDB (PostgreSQL 16 extension)
- **Cache**: Redis 7.2
- **Metrics & Dashboards**: Prometheus & Grafana
- **Testing**: Grafana k6, Toxiproxy, Jest

---

## 2. End-to-End System Flows

### Flow A: Telemetry Ingestion Pipeline
```
[Weather Station]
       │
       ▼ (HTTP / gRPC)
[Ingestion Gateway Service]
       │
       ├──► 1. Check Redis Cache (`station:<id>:valid`)
       │       └── If Miss: Call Station Service via gRPC (Circuit Breaker protected)
       │
       ├──► 2. Range Validation (e.g., Temp: -90°C to +60°C, Pressure: 800-1100 hPa)
       │
       ├──► 3. AMQP Publish with Publisher Confirms (Routing: `telemetry.raw.<region>.<stationId>`)
       │
       └──► 4. Return ACK to Station (< 15ms latency)
```

### Flow B: Micro-Batch Storage Pipeline
```
[RabbitMQ: `weather.raw.telemetry` (Prefetch: 200)]
       │
       ▼ (AMQP Consume with Manual Ack)
[Processing & Analytics Worker]
       │
       ├──► In-Memory Buffer (Batches of 500 items OR 250ms interval)
       │
       ├──► Meteorological Anomaly Evaluation (Pressure drop ΔP, Extreme wind)
       │
       ├──► Multi-row Batch INSERT into TimescaleDB Hypertable (`weather_metrics`)
       │
       └──► Execute `channel.ack(messages)` on DB commit
```

### Flow C: Dynamic Frequency Feedback Loop (The Storm Trigger)
```
[Processing Service detects ΔP > 3 hPa / 3h]
       │
       ▼
[Publishes `weather.anomaly.detected` to RabbitMQ]
       │
       ▼
[Alerting & Control Service consumes anomaly]
       │
       ▼ (Direct gRPC)
[Station Service: `UpdateReportingFrequency(station_id, frequency_seconds: 1)`]
       │
       ▼
[Edge Stations informed via config sync -> Accelerate to 1s reporting]
```

### Flow D: Failure Degradation & Circuit Breaking
```
[Station Service Outage]
       │
       ▼
[Ingestion Service: gRPC calls fail or time out]
       │
       ▼
[Opossum Circuit Breaker trips to OPEN state after 50% failures]
       │
       ▼
[Fallback Handler engages: verifies cryptographic token format]
       │
       └──► Accepts telemetry in DEGRADED mode (Zero client 500 crashes)
```

---

## 3. Monorepo Structure & Dependency Rules

The repository follows standard NestJS monorepo conventions:

```
apps/
  ├── ingestion-service/    # Port 3000 (HTTP), Port 50052 (gRPC)
  ├── station-service/      # Port 50051 (gRPC)
  ├── processing-service/   # Background worker (RabbitMQ consumer)
  └── alerting-service/     # Background worker (Anomaly consumer)

libs/
  ├── contracts/            # Protobuf schemas & shared TypeScript interfaces
  ├── common/               # Logging, interceptors, circuit breakers, retry
  └── rabbitmq/             # AMQP connection lifecycle, publisher confirms, DLQ
```

### Dependency Rules:
1. **`apps/` may import from `libs/`**: Microservices can freely import `@libs/contracts`, `@libs/common`, and `@libs/rabbitmq`.
2. **`apps/` NEVER imports from other `apps/`**: Direct code imports between microservices are strictly prohibited. Interservice communication must occur over **gRPC** or **RabbitMQ**.
3. **`libs/` should have minimal inter-dependencies**:
   - `@libs/contracts` has ZERO dependencies on other internal libs.
   - `@libs/rabbitmq` imports `@libs/common` for logging.

---

## 4. Local Environment & Daily Workflow

### 4.1 Prerequisites
Ensure the following tools are installed:
```bash
node -v   # Must be >= 20.0.0
npm -v    # Must be >= 9.0.0
docker -v # Must be running
```

### 4.2 Starting Backing Services
```bash
docker compose up -d
```
Check health of backing services:
```bash
docker compose ps
```

### 4.3 Environment Variables
Default environment variables are pre-configured for local development. You can customize them in `.env`:

| Variable | Default Value | Used By |
| :--- | :--- | :--- |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | All services |
| `DATABASE_URL` | `postgresql://postgres:postgrespassword@localhost:5432/weather_db` | `station-service`, `processing-service` |
| `REDIS_URL` | `redis://localhost:6379` | `ingestion-service` |
| `STATION_GRPC_URL` | `localhost:50051` | `ingestion-service`, `alerting-service` |
| `INGESTION_HTTP_PORT` | `3000` | `ingestion-service` |
| `INGESTION_GRPC_PORT` | `50052` | `ingestion-service` |

### 4.4 Running Microservices in Development
Run each service with live-reload:
```bash
# In separate terminal windows:
npm run start:station:dev
npm run start:ingestion:dev
npm run start:processing:dev
npm run start:alerting:dev
```

---

## 5. How to Work with the Codebase

### 5.1 Modifying or Adding Protobuf Contracts
Protobuf schemas are stored in [`libs/contracts/src/proto/`](file:///home/boris/devspace/weather-monitoring-system/libs/contracts/src/proto):
- [`station.proto`](file:///home/boris/devspace/weather-monitoring-system/libs/contracts/src/proto/station.proto)
- [`telemetry.proto`](file:///home/boris/devspace/weather-monitoring-system/libs/contracts/src/proto/telemetry.proto)

When modifying a `.proto` file:
1. Update the message or RPC definition in the `.proto` file.
2. Mirror the changes in [`libs/contracts/src/index.ts`](file:///home/boris/devspace/weather-monitoring-system/libs/contracts/src/index.ts) TypeScript interfaces.
3. Update the corresponding controller or client implementation.

### 5.2 Adding a New Microservice
To scaffold a new service inside the monorepo:
1. Create `apps/<new-service>/src/main.ts`, `app.module.ts`, and `tsconfig.app.json`.
2. Register the service in [`nest-cli.json`](file:///home/boris/devspace/weather-monitoring-system/nest-cli.json) under `projects`.
3. Add run scripts to [`package.json`](file:///home/boris/devspace/weather-monitoring-system/package.json):
   ```json
   "start:<new-service>:dev": "nest start <new-service> --watch"
   ```

### 5.3 Publishing a New Event via RabbitMQ
1. Define the routing key in [`libs/rabbitmq/src/rabbitmq.constants.ts`](file:///home/boris/devspace/weather-monitoring-system/libs/rabbitmq/src/rabbitmq.constants.ts).
2. Declare any new queue or binding in `RabbitMQService.initTopology()`.
3. Publish using `RabbitMQService.publishTelemetry(routingKey, payload)`.

### 5.4 Regenerating the Architecture Diagram
The architecture image is defined using **PlantUML** (Diagram as Code). If you add or modify services:
1. Edit [`prompt/system-architecture-diagram.puml`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.puml).
2. Run PlantUML to regenerate the SVG:
   ```bash
   npm run diagram:generate
   # or directly: plantuml -tsvg prompt/system-architecture-diagram.puml
   ```
3. The SVG at [`prompt/system-architecture-diagram.svg`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.svg) will update automatically.

---

## 6. Practical Engineering Conventions

### 6.1 TypeScript & Code Style
- **Strict Mode**: Do not disable `strictNullChecks` or use `any` when explicit types can be modeled.
- **DTO Validation**: Incoming external HTTP bodies must use `class-validator` annotations or manual range guards.
- **Paths**: Always use path aliases (`@libs/contracts`, `@libs/common`, `@libs/rabbitmq`) instead of relative paths like `../../../libs/...`.

### 6.2 Structured Logging
Always use the shared [`AppLogger`](file:///home/boris/devspace/weather-monitoring-system/libs/common/src/logger/logger.service.ts) from `@libs/common`:
```typescript
import { AppLogger } from '@libs/common';

@Injectable()
export class MyService {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('MyService');
  }

  doSomething() {
    this.logger.log('Action performed', 'MyService', { stationId: 'ST-001' });
  }
}
```
All logs emit formatted JSON with timestamps, log level, context tag, and metadata.

### 6.3 Resiliency & Circuit Breaking
Never perform remote gRPC or network I/O without timeout and circuit breaker protection:
```typescript
import { createCircuitBreaker } from '@libs/common';

this.breaker = createCircuitBreaker(
  async (req) => callRemoteRpc(req),
  { timeout: 2000, errorThresholdPercentage: 50, resetTimeout: 5000 },
  async (req) => executeFallback(req),
  this.logger
);
```

### 6.4 Messaging Best Practices
- **Publisher Confirms**: Never assume an AMQP message is saved until the broker confirms. Always await `publishTelemetry()`.
- **Consumer ACKs**: Only acknowledge (`channel.ack(msg)`) after the database write or state change commits successfully.
- **Poison Pills**: On unrecoverable parsing errors, send to Dead-Letter Queue via `channel.nack(msg, false, false)`.

---

## 7. Database & Storage Administration

### 7.1 Inspecting TimescaleDB
Connect to the database via Docker:
```bash
docker exec -it weather-timescaledb psql -U postgres -d weather_db
```

#### Useful Queries:
```sql
-- Check hypertables status
SELECT * FROM timescaledb_information.hypertables;

-- View chunk distribution
SELECT chunk_name, range_start, range_end, is_compressed 
FROM timescaledb_information.chunks 
WHERE hypertable_name = 'weather_metrics';

-- Query recent raw metrics
SELECT time, station_id, temperature, pressure, wind_speed 
FROM weather_metrics 
ORDER BY time DESC LIMIT 10;

-- Query hourly continuous rollups
SELECT * FROM weather_hourly_summary 
ORDER BY bucket DESC LIMIT 10;
```

### 7.2 Inspecting RabbitMQ
Open the web console at [http://localhost:15672](http://localhost:15672) (Username: `guest`, Password: `guest`).
- **Queues to inspect**:
  - `weather.raw.telemetry`: Active incoming telemetry stream.
  - `weather.anomaly.events`: Storm and meteorological alerts.
  - `weather.telemetry.dlq`: Dead-letter queue containing rejected poison pills.

### 7.3 Inspecting Redis Cache
```bash
docker exec -it weather-redis redis-cli

# Check cached station validations
KEYS "station:*:valid"

# Inspect TTL on station validation key
TTL "station:ST-ALPS-001:valid"
```

---

## 8. Testing, Benchmarking & Chaos Verification

### 8.1 Unit Tests
```bash
npm test
```

### 8.2 Load & Stress Testing with k6

#### Dynamic 60x Frequency Surge Scenario:
Simulates baseline load (20 req/s) surging up to 1,200 req/sec sustained during storm front conditions:
```bash
npm run test:k6:spike
```

#### Fleet Growth Scenario:
Simulates ramping active stations up to 5,000 concurrent clients:
```bash
npm run test:k6:growth
```

### 8.3 Chaos & Resilience Testing
Simulates network failures, station-service outages, and poison-pill injections:
```bash
bash test/chaos/run-chaos-suite.sh
```

---

## 9. Troubleshooting & FAQ

### Q: Ingestion Service returns `DEGRADED` (code 4)
- **Cause**: RabbitMQ broker is either starting up or down.
- **Resolution**: Verify `docker compose ps`. If RabbitMQ restarted, Ingestion Service will auto-reconnect within 2 seconds.

### Q: gRPC error: `No connection established` on port 50051
- **Cause**: `station-service` is not running.
- **Resolution**: Start `station-service` via `npm run start:station:dev`. Notice that `ingestion-service` will gracefully fall back without throwing 500 errors to clients thanks to the Opossum circuit breaker.

### Q: How do I test with simulated edge stations continuously?
You can use the k6 spike scenario or run a background curl loop:
```bash
while true; do
  curl -s -X POST http://localhost:3000/api/v1/telemetry \
    -H "Content-Type: application/json" \
    -d "{\"station_id\":\"ST-ALPS-001\",\"temperature\":$((RANDOM % 30)),\"humidity\":60,\"pressure\":1013,\"wind_speed\":5,\"wind_direction\":180,\"precipitation\":0,\"api_key\":\"sec_token_alps_001\"}" > /dev/null
  sleep 1
done
```
