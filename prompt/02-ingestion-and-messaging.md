# Phase 2 Prompt: Ingestion Gateway, Direct gRPC & RabbitMQ Event Broker

> **Execution Goal**: Build the high-throughput Ingestion Gateway, the Station Management microservice with direct gRPC communication, and the resilient RabbitMQ messaging broker with backpressure and DLQ handling.

---

## Task Overview

Implement the first two core microservices and establish both communication paradigms:
1. **Direct Synchronous Communication (gRPC)**: Between `ingestion-service` and `station-service` to validate stations and check their current configuration.
2. **Indirect Asynchronous Communication (RabbitMQ)**: Between `ingestion-service` and downstream consumers for streaming massive telemetry packets with publisher confirms, backpressure, and dead-lettering.

---

## Detailed Requirements

### 1. Station Management Service (`apps/station-service`)
- **Technology**: NestJS with `@nestjs/microservices` (gRPC transport) and TypeORM / Prisma with PostgreSQL.
- **Data Model**:
  - `Station`: `id` (UUID), `code` (e.g. `ST-ALPS-001`), `name`, `latitude`, `longitude`, `elevation`, `status` (`ACTIVE`, `INACTIVE`, `ALERT_MODE`), `reporting_interval_seconds` (default: 60), `created_at`, `updated_at`.
- **gRPC Server**:
  - Implements `StationService` defined in `station.proto`.
  - Methods: `ValidateStation`, `GetStationConfig`, `UpdateReportingFrequency`.
- **Cache Invalidation**:
  - When reporting frequency or status is updated, publish a Redis key expiration or pub/sub message so Ingestion instances instantly refresh local cache.

### 2. Ingestion Service (`apps/ingestion-service`)
- **Role**: Lightweight, non-blocking ingestion gateway.
- **Transports**:
  - **gRPC Server**: For high-performance streaming clients (`StreamTelemetry`, `SubmitTelemetry`).
  - **REST API**: Fallback `POST /api/v1/telemetry` for simpler HTTP/1.1 edge devices.
- **Station Validation Flow**:
  1. Receive incoming telemetry payload.
  2. Check station token/status in local Redis cache (`station:<id>:valid`).
  3. Cache Miss: Invoke `station-service` via direct **gRPC** call.
  4. Protect gRPC call using **Opossum Circuit Breaker**: If `station-service` is unreachable or timing out, fall back to cached state or accept payload tentatively if station code matches known cryptographic format.
- **Payload Validation**:
  - Validate reading ranges (temperature: -90 to +60 °C, humidity: 0 to 100%, pressure: 800 to 1100 hPa).
  - Fast JSON / Protobuf decoding without memory leakage.

### 3. RabbitMQ Topology & Publisher Resiliency (`libs/rabbitmq`)
Create a production-grade RabbitMQ module for NestJS using `amqplib` or `@golevelup/nestjs-rabbitmq`:
- **Exchange**: `weather.telemetry.topic` (Type: `topic`, durable: `true`).
- **Routing Key Schema**: `telemetry.raw.<region>.<station_id>` (e.g., `telemetry.raw.eu-west.ST-ALPS-001`).
- **Dead Letter Exchange (DLX)**:
  - Exchange: `weather.telemetry.dlx` (Type: `direct`).
  - Queue: `weather.telemetry.dlq` (Durable, stores unparseable or rejected messages).
- **Publisher Confirms & Flow Control**:
  - Initialize channel with `publisherConfirms: true`.
  - Ingestion service awaits publisher confirmation before returning success to client.
  - Listen to `drain` and `channel.on('blocked')` events to implement backpressure (throttle incoming HTTP/gRPC requests when RabbitMQ is under memory alarm).

---

## Step-by-Step Implementation Instructions
1. Scaffold `apps/station-service` with gRPC controller and PostgreSQL migrations.
2. Scaffold `apps/ingestion-service` with gRPC client client-stub connecting to `station-service:50051`.
3. Build the reusable `RabbitmqModule` in `libs/rabbitmq` supporting connection retries and publisher confirms.
4. Integrate Redis for caching station validation responses with a 5-minute TTL.
5. Create comprehensive E2E tests simulating a station transmitting telemetry via both gRPC and REST.

---

## Deliverables & Verification Steps
1. Station Service running on gRPC port `50051`.
2. Ingestion Service running on HTTP port `3000` and gRPC port `50052`.
3. Ingest test payload: verify message appears in RabbitMQ queue `weather.raw.telemetry`.
4. Run `grpcurl` or Evans to test gRPC endpoints directly:
   ```bash
   grpcurl -plaintext -d '{"station_id":"ST-ALPS-001","temperature":22.5,"humidity":55.0,"pressure":1013.2}' localhost:50052 weather.telemetry.v1.WeatherIngestionService/SubmitTelemetry
   ```
5. Confirm that invalid payloads are routed to the Dead Letter Queue.
