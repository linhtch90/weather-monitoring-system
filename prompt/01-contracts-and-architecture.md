# Phase 1 Prompt: Monorepo Foundation, Protobuf Contracts & Core Architecture

> **Execution Goal**: Establish the NestJS monorepo workspace, define the gRPC Protocol Buffer schemas for direct microservice communication, configure shared TypeScript interfaces, and lay out Docker Compose infrastructure.

---

## Task Overview

Set up the project foundation for the Cloud-Native Weather Monitoring System using a NestJS monorepo architecture with open-source tools:
1. Initialize a NestJS monorepo containing `apps` and shared `libs`.
2. Define Protobuf definitions (`.proto`) for direct synchronous inter-service communication (gRPC).
3. Implement shared libraries (`@libs/contracts`, `@libs/common`).
4. Provide a developer-ready `docker-compose.yml` with open-source dependencies (PostgreSQL with TimescaleDB, RabbitMQ with Management UI, Redis, Prometheus).

---

## Detailed Requirements

### 1. Protobuf Contracts (`libs/contracts/proto/`)
Create strong gRPC contracts for direct communication between services:

#### `station.proto`
- Package: `weather.station.v1`
- Service `StationService`:
  - `ValidateStation(ValidateStationRequest)` returns `ValidateStationResponse` (verifies station identity, status: ACTIVE/INACTIVE/MAINTENANCE, and current reporting interval).
  - `GetStationConfig(GetStationConfigRequest)` returns `StationConfigResponse` (coordinates, active sensors, reporting frequency in seconds).
  - `UpdateReportingFrequency(UpdateReportingFrequencyRequest)` returns `UpdateReportingFrequencyResponse` (updates interval dynamically when conditions change).

#### `telemetry.proto`
- Package: `weather.telemetry.v1`
- Service `WeatherIngestionService`:
  - `StreamTelemetry(stream TelemetryPayload)` returns `IngestionAck` (bidirectional/client streaming for high-frequency station uplinks).
  - `SubmitTelemetry(TelemetryPayload)` returns `IngestionAck` (unary gRPC call).
- Message definitions for `TelemetryPayload`:
  - `station_id`: string (UUID or station code)
  - `timestamp`: int64 (Unix epoch milliseconds)
  - `temperature`: float (Celsius)
  - `humidity`: float (Percentage 0-100)
  - `pressure`: float (hPa)
  - `wind_speed`: float (m/s)
  - `wind_direction`: int32 (degrees 0-359)
  - `precipitation`: float (mm/hr)
  - `battery_voltage`: float (volts)
  - `firmware_version`: string

### 2. NestJS Monorepo Structure
Configure `nest-cli.json` and `tsconfig.json` paths for clean path mapping:
```json
{
  "compilerOptions": {
    "paths": {
      "@libs/contracts": ["libs/contracts/src"],
      "@libs/contracts/*": ["libs/contracts/src/*"],
      "@libs/common": ["libs/common/src"],
      "@libs/common/*": ["libs/common/src/*"]
    }
  }
}
```

### 3. Shared Library: `@libs/common`
Implement reusable cross-cutting concerns:
- **Logging**: Structured JSON logger (using Pino or Winston) attaching correlation IDs to every request.
- **Interceptors**: gRPC logging interceptor and timing interceptor.
- **Filters**: gRPC exception filter mapping standard exceptions to gRPC status codes (`NOT_FOUND`, `INVALID_ARGUMENT`, `UNAVAILABLE`).
- **Validation**: Shared class-validator DTOs with strict boundary constraints.

### 4. Infrastructure: `docker-compose.yml`
Configure 100% open-source local services:
- **RabbitMQ**: `rabbitmq:3.13-management-alpine` (ports 5672, 15672).
- **TimescaleDB**: `timescale/timescaledb:latest-pg16` (port 5432) with credentials and volume mounts.
- **Redis**: `redis:7.2-alpine` (port 6379) for caching and rate-limiting.
- **Prometheus**: `prom/prometheus:latest` (port 9090) with scrapers configured for microservice endpoints.

---

## Deliverables & Verification Steps
1. Valid `.proto` files in `libs/contracts/proto/` compiled to TypeScript types via `ts-proto` or NestJS gRPC compiler.
2. NestJS workspace builds without any TypeScript errors: `npm run build`.
3. `docker-compose up -d` boots all backing services with healthy status.
4. Clean documentation on how each microservice imports `@libs/contracts` and `@libs/common`.
