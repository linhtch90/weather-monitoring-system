# Weather Monitoring System — AI Agent Rules & Guidelines

This repository implements a high-throughput, cloud-native **Weather Telemetry Monitoring System** using a NestJS TypeScript monorepo, gRPC, RabbitMQ, TimescaleDB, and Redis.

## 1. Monorepo Architecture & Dependency Boundaries

- **Apps (`apps/*`)**:
  - `ingestion-service`: High-throughput gateway (HTTP REST `:3000` + gRPC `:50052`).
  - `station-service`: Station registry & dynamic reporting frequency controller (gRPC `:50051` + PostgreSQL).
  - `processing-service`: RabbitMQ consumer writing micro-batches to TimescaleDB and running anomaly detection.
  - `alerting-service`: Consumes anomaly events from RabbitMQ and triggers dynamic 1s frequency shifts via gRPC.
- **Strict Isolation Rule**: A microservice under `apps/<service-a>` MUST NEVER import files directly from `apps/<service-b>`. All cross-service communication must use **gRPC** (synchronous) or **RabbitMQ** (asynchronous).
- **Path Aliases**: Always import shared libraries via `@libs/contracts`, `@libs/common`, and `@libs/rabbitmq`—never use relative paths like `../../../libs/`.
- **Library Dependency Order**:
  - `@libs/contracts` must have zero dependencies on other internal libraries.
  - `@libs/common` and `@libs/rabbitmq` may only depend on `@libs/contracts` and `@libs/common`.

## 2. Communication & Resilience Standards

- **Direct Synchronous Calls (gRPC)**:
  - Always resolve `.proto` files via `resolveProtoPath()` in `libs/contracts/src/index.ts` so both watch mode (`libs/contracts/src/proto/`) and compiled `dist/` paths resolve cleanly.
  - Wrap all outbound gRPC client calls in `createCircuitBreaker()` from `@libs/common` (`libs/common/src/resilience/circuit-breaker.ts`) with an explicit fallback handler so downstream outages degrade gracefully instead of failing client requests.
  - Keep the CommonJS/ESM constructor normalization `(CircuitBreaker as any)?.default || CircuitBreaker` intact for `opossum`.
- **Asynchronous Messaging (RabbitMQ)**:
  - Publishers must use `RabbitMQService.publishTelemetry()` with Publisher Confirms enabled.
  - Consumers must use manual acknowledgments (`noAck: false`) and enforce channel `prefetch` limits (`RABBITMQ_CONSTANTS.PREFETCH.DEFAULT = 200`) for backpressure.
  - Only call `channel.ack(msg)` after database writes or downstream actions succeed.
  - On unrecoverable payload corruption (poison pills), call `channel.nack(msg, false, false)` to route messages to `weather.telemetry.dlq`.
  - In `libs/rabbitmq/src/rabbitmq.service.ts`, type the connection returned by `amqp.connect()` as `amqp.ChannelModel` (not `amqp.Connection`).

## 3. Database & Performance Invariants

- **Hybrid Persistence Strategy**:
  - **Relational Metadata (`apps/station-service`)**: Use **TypeORM** (`DataSource` and `Repository<StationRecord>`) for station registry, configuration, and relational entities while maintaining graceful in-memory fallback on connection outages.
  - **Time-Series Telemetry (`apps/processing-service`)**: Use the raw `pg.Pool` driver (`TimescaleRepository.insertBatch`) for high-throughput parameterized multi-row micro-batch inserts into TimescaleDB hypertables (avoid ORM object-instantiation overhead on 60x burst write paths).
- **No Single-Row Telemetry Inserts**: High-frequency telemetry (up to 1s intervals / 60x burst) must be buffered in memory and committed in parameterized multi-row micro-batches (`TimescaleRepository.insertBatch` in `apps/processing-service`).
- **100% Open-Source Stack**: Do not introduce proprietary SDKs or cloud-vendor-locked services.

## 4. Coding & Documentation Conventions

- **Logging**: Always inject and use `AppLogger` from `@libs/common` with `this.logger.setContext('<ClassName>')`. Do not use raw `console.log` in application services.
- **Diagram as Code**: When adding or changing microservices, queues, or communication paths, update `prompt/generate_diagram.py` and run `python3 prompt/generate_diagram.py` to regenerate `prompt/system-architecture-diagram.svg`.
  - **SVG XML Compliance**: Never use HTML named entities (`&bull;`, `&Delta;`, `&rarr;`) inside SVG strings; always use numeric XML character references (`&#8226;`, `&#916;`, `&#8594;`) so strict XML parsers like Firefox render without errors.
