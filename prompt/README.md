# Cloud-Native Weather Monitoring System — Prompt Suite

This directory contains a complete, production-grade prompt engineering suite designed to guide the architecture, scaffolding, implementation, and verification of a high-throughput, cloud-native **Weather Monitoring and Telemetry Analytics System**.

The entire solution is strictly designed around **100% open-source technologies**, **NestJS (TypeScript)**, **gRPC**, **RabbitMQ**, **TimescaleDB**, and **Kubernetes/KEDA**.

---

## Prompt Suite Overview

| File | Title | Target Scope |
| :--- | :--- | :--- |
| **[`00-master-system-prompt.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/00-master-system-prompt.md)** | **Master System Prompt** | The comprehensive, end-to-end specification. Feed this to an AI model to provide full context of the architecture, data flows, standards, and requirements. |
| **[`system-design.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-design.md)** | **System Design Document** | Interactive Mermaid architectural diagrams, end-to-end telemetry sequence flows, dynamic frequency loops, and chaos resilience pathways. |
| **[`system-architecture-diagram.svg`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.svg)** | **Vector Architecture Image** | Production-grade high-resolution SVG diagram generated directly from code. |
| **[`system-architecture-diagram.puml`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.puml)** | **PlantUML Diagram Source** | Declarative PlantUML Diagram-as-Code source used to generate and version-control `system-architecture-diagram.svg`. |
| **[`system-architecture.dot`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture.dot)** | **Graphviz DOT Source** | Declarative Graphviz source code of components and interactions. |
| **[`01-contracts-and-architecture.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/01-contracts-and-architecture.md)** | **Phase 1: Contracts & Foundation** | Scaffolding the NestJS monorepo, Protocol Buffers (`.proto`), shared libraries (`@libs/contracts`, `@libs/common`), and Docker Compose environment. |
| **[`02-ingestion-and-messaging.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/02-ingestion-and-messaging.md)** | **Phase 2: Ingestion & Messaging** | Ingestion Gateway (HTTP + gRPC), Station Management Service (Postgres), direct gRPC communication, and RabbitMQ topologies (topic exchanges, publisher confirms, DLQ). |
| **[`03-processing-and-storage.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/03-processing-and-storage.md)** | **Phase 3: Processing & Persistence** | Processing Service, TimescaleDB hypertable partitioning, micro-batch writes (500 records / 250ms), meteorological anomaly detection, and automated dynamic frequency adjustments. |
| **[`04-scalability-and-load-testing.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/04-scalability-and-load-testing.md)** | **Phase 4: Scalability & Load Testing** | Grafana **k6** scenarios simulating baseline load vs severe weather dynamic frequency spikes (60x surge from 60s to 1s interval), fleet growth to 10,000 stations, and KEDA autoscaling. |
| **[`05-resiliency-and-chaos-testing.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/05-resiliency-and-chaos-testing.md)** | **Phase 5: Resiliency & Chaos Testing** | Automated fault injection (RabbitMQ crash, gRPC latency with Opossum circuit breaker, database slowdown backpressure, poison pill DLQ routing). |

---

## Architectural Highlights Addressed in the Prompts

### 1. Dual Interservice Communication Paradigms
- **Direct Synchronous Communication (gRPC)**:
  - Low-latency, type-safe RPCs across microservices (e.g., Ingestion Gateway calling Station Service for station token and configuration checks).
  - Defined cleanly via Protocol Buffers in `libs/contracts/proto/`.
- **Indirect Asynchronous Communication (RabbitMQ)**:
  - High-throughput telemetry streaming decoupled from consumer processing speed.
  - Topic exchanges with routing keys (`telemetry.raw.<region>.<station_id>`).
  - Strict publisher confirms, manual consumer ACKs, and prefetch limits (`prefetch(200)`).

### 2. Handling Dynamic Reporting Frequencies & Sudden Bursts
- **The Problem**: When extreme weather events strike (e.g. storms, hurricanes), scientists or automated triggers change the reporting interval from **60 seconds down to 1 second** (a **60x data explosion**).
- **The Solution**:
  - Ingestion Gateway remains ultra-lightweight, dumping raw frames to RabbitMQ in $< 15\text{ms}$.
  - Processing Service consumes using micro-batch buffering (e.g. 500 records or 250ms flushes) into TimescaleDB.
  - Autoscaling via **KEDA** dynamically scales consumer pods based on RabbitMQ queue depth.

### 3. High Availability & Chaos Resilience
- **Circuit Breakers (Opossum)**: Protects gRPC calls from cascading timeouts when dependencies fail.
- **Backpressure & Zero Data Loss**: RabbitMQ prefetch ensures memory bounds are preserved even if the database slows down.
- **Dead-Letter Exchange (DLX/DLQ)**: Poison pills are isolated after 3 retries without blocking active telemetry queues.

### 4. 100% Open-Source Technology Stack
- **Runtime**: Node.js & TypeScript
- **Framework**: NestJS
- **Communication**: gRPC / Protobuf & RabbitMQ
- **Databases**: TimescaleDB (PostgreSQL) & Redis
- **Observability**: Prometheus & Grafana
- **Testing**: Grafana k6, Toxiproxy, Jest

---

## How to Use These Prompts

1. **One-Shot Project Generation / Review**:
   - Provide [`00-master-system-prompt.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/00-master-system-prompt.md) to an AI assistant or software architect for overall system validation and high-level scaffolding.
2. **Phase-by-Phase Iterative Development**:
   - Execute sequentially starting from [`01-contracts-and-architecture.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/01-contracts-and-architecture.md) through [`05-resiliency-and-chaos-testing.md`](file:///home/boris/devspace/weather-monitoring-system/prompt/05-resiliency-and-chaos-testing.md).
   - This ensures that each layer (contracts $\rightarrow$ ingestion $\rightarrow$ processing $\rightarrow$ scale tests $\rightarrow$ chaos tests) is implemented with unit tests, verified, and benchmarked before moving to the next.
