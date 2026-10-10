# Phase 5 Prompt: Availability, Resiliency & Chaos Engineering Testing

> **Execution Goal**: Implement and execute automated chaos experiments and resiliency tests to guarantee high availability, fault tolerance, and zero data loss under infrastructure failures and network partitions.

---

## Task Overview

A cloud-native microservices system must survive transient faults, network partitions, and cascading crashes.
You will write automated resilience test scenarios and chaos scripts using open-source tools (**Toxiproxy**, **Docker failure injection**, **Jest integration tests**) to validate the system's fault tolerance mechanisms.

---

## Detailed Requirements

### 1. Chaos Scenarios & Automated Test Harness (`test/chaos/`)

#### Scenario 1: RabbitMQ Broker Crash & Recovery
- **Failure Injected**: Abruptly stop or pause the RabbitMQ container (`docker pause weather-rabbitmq` or Toxiproxy downstream cut) while high-frequency telemetry is actively streaming.
- **Expected System Behavior**:
  1. Ingestion Service detects connection drop; logs warning with correlation ID; does **not** crash the Node.js process.
  2. Ingestion Service enters degraded mode: buffers up to $N$ payloads in local memory or Redis fallback buffer, or returns HTTP 503 / gRPC `UNAVAILABLE` with `Retry-After` header to stations.
  3. RabbitMQ container is resumed (`docker unpause weather-rabbitmq`).
  4. Ingestion Service automatically reconnects, re-declares channels, drains buffered payloads, and resumes regular operation with **zero unhandled exceptions**.

#### Scenario 2: Station Service gRPC Outage & Circuit Breaker Trip
- **Failure Injected**: Kill `station-service` or introduce 5,000ms network latency via Toxiproxy.
- **Expected System Behavior**:
  1. Ingestion Service's **Opossum Circuit Breaker** trips to `OPEN` state after 50% failure rate over 10 seconds.
  2. Subsequent incoming station validations immediately trigger fallback logic:
     - Verify against local Redis cache if present.
     - Accept payload tentatively with flag `verification_pending: true`.
  3. Client stations experience **no gRPC timeouts** or 500 crashes.
  4. When `station-service` recovers, circuit breaker transitions to `HALF_OPEN` and resets to `CLOSED`.

#### Scenario 3: Database Slowdown & Consumer Backpressure
- **Failure Injected**: Inject a 2,000ms delay on TimescaleDB write queries or lock the `weather_metrics` hypertable.
- **Expected System Behavior**:
  1. Processing Service batch insert takes longer than normal.
  2. RabbitMQ `prefetch: 200` restricts the consumer from fetching more messages until prior batches are acknowledged.
  3. In-flight memory footprint of Processing Service stays flat (no `JavaScript heap out of memory` crash).
  4. Telemetry safely accumulates on RabbitMQ durable disk queues without data loss.
  5. Once DB latency clears, processing service drains backlogged queue at maximum throughput.

#### Scenario 4: Poison Pill & Schema Corruption (DLQ Verification)
- **Failure Injected**: Transmit 50 deliberately malformed payloads with corrupted timestamps, extreme non-physical values, or broken binary frames.
- **Expected System Behavior**:
  1. Ingestion / Processing service validation flags the payload as unprocessable.
  2. Message is retried up to 3 times with exponential backoff using custom headers (`x-retry-count`).
  3. Upon exceeding 3 retries, message is routed to `weather.telemetry.dlq`.
  4. Main consumer queue `weather.raw.telemetry` continues processing healthy messages without blocking (no head-of-line blocking).

---

## Resiliency Implementation Checkpoints

Ensure the codebase contains:
- **Opossum Circuit Breaker**: Wrapped around gRPC clients in `@libs/common/resilience/circuit-breaker.ts`.
- **Exponential Backoff & Jitter**: Utility function `withRetry(operation, { maxRetries: 3, baseDelayMs: 200, jitter: true })`.
- **RabbitMQ Reconnection Strategy**: Automatic channel re-establishment with event listeners on `'close'` and `'error'`.
- **Graceful Shutdown**:
  ```typescript
  async onApplicationShutdown(signal?: string) {
    logger.log(`Received ${signal}, draining connections...`);
    await rabbitmqService.drainAndClose();
    await databaseService.close();
  }
  ```

---

## Deliverables & Verification Steps
1. Automated chaos test runner script (`test/chaos/run-chaos-suite.sh` or Node.js test script).
2. Chaos validation report demonstrating:
   - System survives RabbitMQ restart with 0 process crashes.
   - Circuit breaker trips and recovers without human intervention.
   - Poison pills safely arrive in `weather.telemetry.dlq`.
   - Consumer memory usage remains bounded under database latency.
