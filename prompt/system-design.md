# System Design & Architecture Topology

This document illustrates the complete architectural blueprint for the **Cloud-Native Weather Monitoring System**.

![System Architecture Diagram](system-architecture-diagram.png)

> **Diagram as Code**: The architecture image above is generated directly from [`system-architecture-diagram.puml`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.puml) using **PlantUML**. Whenever architecture changes occur in the future, you can update the PlantUML source and run `plantuml -tpng prompt/system-architecture-diagram.puml` (or `npm run diagram:generate`) to re-generate [`system-architecture-diagram.png`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture-diagram.png). Graphviz DOT source is also available at [`system-architecture.dot`](file:///home/boris/devspace/weather-monitoring-system/prompt/system-architecture.dot).

---

## 1. High-Level System Architecture Diagram

```mermaid
flowchart TD
    subgraph EdgeClients["Edge Tier: Weather Stations & Operators"]
        WS1["Weather Station 1\n(Normal: 60s / Burst: 1s)"]
        WS2["Weather Station 2\n(Normal: 60s / Burst: 1s)"]
        WSN["Weather Station N...\n(Fleet: 1,000 to 10,000+)"]
        Scientists["Scientists & Operators\n(Manual Frequency Adjustment)"]
    end

    subgraph Ingress["Ingress & Gateway Tier"]
        IngestionSvc["Ingestion Gateway Service\n(NestJS: gRPC & REST API)"]
        RedisCache[("Redis 7.2\n(Auth Cache & Rate Limiting)")]
    end

    subgraph SyncServices["Direct gRPC Services"]
        StationSvc["Station Management Service\n(NestJS gRPC Server)"]
        PostgresMeta[("PostgreSQL\n(Station Metadata & Calibration)")]
    end

    subgraph MessageBroker["Asynchronous Message Broker Tier"]
        RabbitMQ["RabbitMQ 3.13 (AMQP 0-9-1)\nExchange: weather.telemetry.topic"]
        TelemetryQueue["Queue: weather.raw.telemetry\n(Prefetch: 200, Durable)"]
        DLQ["Queue: weather.telemetry.dlq\n(Dead Letter Exchange / DLX)"]
    end

    subgraph ProcessingTier["Data Processing & Analytical Tier"]
        KEDA["KEDA Autoscaler\n(Monitors Queue Depth)"]
        ProcSvc["Processing & Analytics Service\n(Micro-Batch Buffer: 500 records / 250ms)"]
        TimescaleDB[("TimescaleDB (PostgreSQL 16)\nHypertable: weather_metrics\nContinuous Aggregates")]
    end

    subgraph ControlAlertTier["Alerting & Dynamic Control Tier"]
        AlertSvc["Alerting & Control Service\n(Storm & Anomaly Subscriber)"]
        QuerySvc["Query & Reporting Service\n(Historical & Real-Time API)"]
    end

    subgraph ObservabilityTesting["Observability & Resilience Testing"]
        Prometheus["Prometheus Metrics"]
        Grafana["Grafana Dashboards"]
        K6["k6 Load Generator\n(60x Dynamic Frequency Surge)"]
        Chaos["Toxiproxy / Chaos Runner\n(Network & Broker Injection)"]
    end

    %% Client flows
    WS1 -->|"Streaming / Batch (gRPC / HTTP)"| IngestionSvc
    WS2 -->|"Streaming / Batch (gRPC / HTTP)"| IngestionSvc
    WSN -->|"Streaming / Batch (gRPC / HTTP)"| IngestionSvc
    Scientists -->|"Set Sampling Interval"| StationSvc

    %% Ingestion flows
    IngestionSvc <-->|"Token / Status Lookup"| RedisCache
    IngestionSvc -->|"Direct gRPC (Circuit Breaker)"| StationSvc
    StationSvc <-->|"CRUD Station Metadata"| PostgresMeta

    %% Messaging flows
    IngestionSvc -->|"Publisher Confirms (routing: telemetry.raw.*)"| RabbitMQ
    RabbitMQ --> TelemetryQueue
    RabbitMQ -.->|"Poison Pills / Malformed"| DLQ

    %% Processing flows
    TelemetryQueue -->|"Manual ACK & Prefetch"| ProcSvc
    KEDA -.->|"Auto-scale Replicas"| ProcSvc
    ProcSvc -->|"Bulk Micro-Batch Inserts"| TimescaleDB
    ProcSvc -->|"Publish: weather.anomaly.detected"| RabbitMQ

    %% Control Loop
    RabbitMQ -->|"Consume Anomaly Event"| AlertSvc
    AlertSvc -->|"Direct gRPC: UpdateReportingFrequency(1s)"| StationSvc
    StationSvc -.->|"Broadcast New Frequency"| EdgeClients

    %% Query API
    QuerySvc <-->|"Continuous Aggregate Queries"| TimescaleDB

    %% Observability
    IngestionSvc -.->|"Scrape Metrics"| Prometheus
    ProcSvc -.->|"Scrape Metrics"| Prometheus
    RabbitMQ -.->|"Queue Depth Metric"| Prometheus
    Prometheus --> Grafana
    K6 -.->|"Stress Test"| IngestionSvc
    Chaos -.->|"Inject Latency / Outages"| RabbitMQ
    Chaos -.->|"Inject Latency"| StationSvc
```

---

## 2. Ingestion & Storage Pipeline (Sequence Flow)

```mermaid
sequenceDiagram
    autonumber
    participant WS as Weather Station
    participant ING as Ingestion Gateway
    participant REDIS as Redis Cache
    participant STN as Station Service (gRPC)
    participant RMQ as RabbitMQ Topic Exchange
    participant PROC as Processing Service
    participant TSDB as TimescaleDB

    WS->>ING: SubmitTelemetry(payload) [HTTP / gRPC]
    ING->>REDIS: GET station:{id}:valid
    alt Cache Miss
        ING->>STN: gRPC ValidateStation(station_id)
        STN-->>ING: ValidateStationResponse(ACTIVE, freq=60s)
        ING->>REDIS: SETEX station:{id}:valid 300s
    else Cache Hit
        REDIS-->>ING: Cached Status (ACTIVE)
    end

    ING->>RMQ: basicPublish("weather.telemetry.topic", payload)
    RMQ-->>ING: Publisher Confirm (ACK)
    ING-->>WS: IngestionAck(status: SUCCESS, latency < 15ms)

    Note over RMQ,PROC: Asynchronous Decoupling & Backpressure
    RMQ->>PROC: Deliver Telemetry (Prefetch limit = 200)
    PROC->>PROC: Buffer payload in micro-batch (500 records or 250ms)
    PROC->>TSDB: Multi-row INSERT / COPY batch into hypertable
    TSDB-->>PROC: Transaction Commit OK
    PROC->>RMQ: basicAck(deliveryTag)
```

---

## 3. Dynamic Frequency Surge Feedback Loop

```mermaid
sequenceDiagram
    autonumber
    participant WS as Weather Stations
    participant PROC as Processing Service
    participant RMQ as RabbitMQ
    participant ALERT as Alerting Service
    participant STN as Station Service
    participant KEDA as KEDA Autoscaler

    Note over WS,PROC: Regular Condition (1 report every 60s)
    WS->>PROC: Telemetry: Pressure = 1012 hPa (Normal)

    Note over WS,PROC: Severe Storm Approaching!
    WS->>PROC: Telemetry: Pressure = 1005 hPa (Rapid drop: ΔP > 3 hPa / 3h)
    PROC->>PROC: Anomaly Rule Triggered: EXTREME_PRESSURE_DROP
    PROC->>RMQ: Publish "weather.anomaly.detected" (region: "ALPS")

    RMQ->>ALERT: Consume "weather.anomaly.detected"
    ALERT->>STN: Direct gRPC UpdateReportingFrequency(region="ALPS", interval=1s)
    STN-->>WS: Broadcast Config Push: Change interval to 1s

    Note over WS,RMQ: 60x Traffic Surge (1,000 req/sec)
    WS->>RMQ: Rapid 1s telemetry packets flood in
    RMQ->>KEDA: Queue depth rises (> 500 messages)
    KEDA->>PROC: Scale Processing Service pods (2 -> 15 replicas)
    Note over PROC: Scaled pods drain queue in parallel with 0 packet loss
```

---

## 4. Resiliency & Failure Degradation (Chaos Flow)

```mermaid
sequenceDiagram
    autonumber
    participant WS as Weather Station
    participant ING as Ingestion Gateway
    participant CB as Opossum Circuit Breaker
    participant STN as Station Service (Crashed)
    participant REDIS as Redis Fallback
    participant RMQ as RabbitMQ

    WS->>ING: SubmitTelemetry(payload)
    ING->>CB: Execute gRPC ValidateStation()
    CB-xSTN: gRPC Call Times Out / Refused
    Note over CB: Failure threshold crossed (50% failures)<br/>Circuit transitions to OPEN state
    CB-->>ING: Circuit OPEN (Immediate Fast Fallback)
    ING->>REDIS: Read stale cache or cryptographic station token
    REDIS-->>ING: Validation Approved (Degraded Mode)
    ING->>RMQ: Publish telemetry to RabbitMQ
    RMQ-->>ING: Confirm ACK
    ING-->>WS: IngestionAck(status: SUCCESS, degraded: true)
    Note over WS: Client station experiences ZERO timeouts or 500 errors
```
