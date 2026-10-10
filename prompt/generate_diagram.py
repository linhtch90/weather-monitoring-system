#!/usr/bin/env python3
"""
generate_diagram.py
-------------------
Generates the Cloud-Native Weather Monitoring System Architecture Diagram as a high-resolution SVG.
This script has ZERO external dependencies (uses Python standard library).
All characters are 100% XML/SVG standard compliant (UTF-8 / numeric XML entities).

To run / modify:
    python3 prompt/generate_diagram.py
Output:
    prompt/system-architecture-diagram.svg
"""

import os
from pathlib import Path

def generate_svg() -> str:
    svg_width = 1600
    svg_height = 1080

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}">
  <defs>
    <!-- Gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>

    <linearGradient id="edgeCardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <linearGradient id="gatewayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0369a1" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <linearGradient id="grpcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>

    <linearGradient id="rabbitmqGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c2410c" />
      <stop offset="100%" stop-color="#ea580c" />
    </linearGradient>

    <linearGradient id="procGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>

    <linearGradient id="dbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#14b8a6" />
    </linearGradient>

    <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b91c1c" />
      <stop offset="100%" stop-color="#ef4444" />
    </linearGradient>

    <linearGradient id="obsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>

    <!-- Drop Shadows -->
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.45" />
    </filter>

    <!-- Arrow Markers -->
    <marker id="arrow-grpc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#60a5fa" />
    </marker>
    <marker id="arrow-amqp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#fb923c" />
    </marker>
    <marker id="arrow-db" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#2dd4bf" />
    </marker>
    <marker id="arrow-alert" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#f87171" />
    </marker>
    <marker id="arrow-dlq" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
    </marker>
    <marker id="arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
    </marker>
  </defs>

  <style>
    text {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }}
    .title {{ font-size: 26px; font-weight: 800; fill: #f8fafc; letter-spacing: 0.5px; }}
    .subtitle {{ font-size: 14px; font-weight: 400; fill: #94a3b8; }}
    .badge {{ font-size: 11px; font-weight: 700; fill: #f8fafc; text-anchor: middle; }}
    .tier-label {{ font-size: 14px; font-weight: 700; fill: #38bdf8; text-transform: uppercase; letter-spacing: 1px; }}
    .node-title {{ font-size: 15px; font-weight: 700; fill: #ffffff; }}
    .node-sub {{ font-size: 12px; font-weight: 400; fill: #cbd5e1; }}
    .legend-text {{ font-size: 12px; font-weight: 600; fill: #e2e8f0; }}
  </style>

  <!-- Background -->
  <rect width="{svg_width}" height="{svg_height}" fill="url(#bgGrad)" />

  <!-- Grid overlay -->
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.5" stroke-opacity="0.3" />
  </pattern>
  <rect width="{svg_width}" height="{svg_height}" fill="url(#grid)" />

  <!-- Header Header Banner -->
  <g transform="translate(50, 30)">
    <rect width="1500" height="70" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="30" y="36" class="title">CLOUD-NATIVE WEATHER TELEMETRY MONITORING ARCHITECTURE</text>
    <text x="30" y="56" class="subtitle">High-Throughput Ingestion &#8226; Direct gRPC &#8226; Asynchronous RabbitMQ &#8226; TimescaleDB &#8226; Dynamic Frequency Feedback</text>
    <rect x="1350" y="20" width="120" height="30" rx="6" fill="#0284c7" />
    <text x="1410" y="39" class="badge">100% OPEN SOURCE</text>
  </g>

  <!-- ================= TIER 1: EDGE CLIENT FLEET ================= -->
  <g transform="translate(50, 120)">
    <rect width="400" height="210" rx="12" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label">1. Edge Client Fleet (Thousands of Stations)</text>

    <!-- Station 1 -->
    <rect x="20" y="50" width="360" height="60" rx="8" fill="url(#edgeCardGrad)" stroke="#475569" stroke-width="1" filter="url(#shadow)" />
    <circle cx="45" cy="80" r="14" fill="#0ea5e9" />
    <text x="45" y="85" font-size="16" fill="#ffffff" text-anchor="middle" font-weight="bold">&#9889;</text>
    <text x="70" y="73" class="node-title">Weather Monitoring Stations (Fleet)</text>
    <text x="70" y="93" class="node-sub">Baseline: 1 req/60s &#8226; Severe Burst: 1 req/1s (60x Surge)</text>

    <!-- Scientists / Ops -->
    <rect x="20" y="130" width="360" height="60" rx="8" fill="url(#edgeCardGrad)" stroke="#475569" stroke-width="1" filter="url(#shadow)" />
    <circle cx="45" cy="160" r="14" fill="#a855f7" />
    <text x="45" y="165" font-size="16" fill="#ffffff" text-anchor="middle" font-weight="bold">&#9881;</text>
    <text x="70" y="153" class="node-title">Scientists &amp; Meteorological Ops</text>
    <text x="70" y="173" class="node-sub">Dynamic frequency override commands &amp; station config</text>
  </g>

  <!-- ================= TIER 2: INGESTION GATEWAY & AUTH CACHE ================= -->
  <g transform="translate(520, 120)">
    <rect width="520" height="210" rx="12" fill="#0f172a" stroke="#0284c7" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#38bdf8">2. Ingestion Gateway Tier (High-Throughput)</text>

    <!-- Ingestion Svc -->
    <rect x="20" y="50" width="300" height="140" rx="8" fill="url(#gatewayGrad)" stroke="#38bdf8" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="80" class="node-title">Ingestion Gateway Service</text>
    <text x="35" y="102" class="node-sub">&#8226; NestJS Framework (TypeScript)</text>
    <text x="35" y="122" class="node-sub">&#8226; gRPC Streaming &amp; REST Fallback</text>
    <text x="35" y="142" class="node-sub">&#8226; Ultra-fast packet drop (&lt;15ms)</text>
    <text x="35" y="162" class="node-sub">&#8226; Opossum Circuit Breaker Protected</text>

    <!-- Redis Cache -->
    <rect x="340" y="50" width="160" height="140" rx="8" fill="url(#edgeCardGrad)" stroke="#ef4444" stroke-width="1.5" filter="url(#shadow)" />
    <text x="355" y="80" class="node-title" fill="#f87171">Redis 7.2 Cache</text>
    <text x="355" y="105" class="node-sub">&#8226; Token Auth</text>
    <text x="355" y="125" class="node-sub">&#8226; Rate Limiting</text>
    <text x="355" y="145" class="node-sub">&#8226; 5-min Station TTL</text>
    <text x="355" y="165" class="node-sub">&#8226; Fast Fallback</text>
  </g>

  <!-- ================= TIER 3: DIRECT gRPC & STATION SERVICE ================= -->
  <g transform="translate(1110, 120)">
    <rect width="440" height="210" rx="12" fill="#0f172a" stroke="#2563eb" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#60a5fa">3. Station Management (Direct gRPC)</text>

    <!-- Station Service -->
    <rect x="20" y="50" width="230" height="140" rx="8" fill="url(#grpcGrad)" stroke="#60a5fa" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="80" class="node-title">Station Service</text>
    <text x="35" y="102" class="node-sub">&#8226; Direct gRPC Protobuf</text>
    <text x="35" y="122" class="node-sub">&#8226; ValidateStation()</text>
    <text x="35" y="142" class="node-sub">&#8226; UpdateFrequency()</text>
    <text x="35" y="162" class="node-sub">&#8226; Fleet Registry</text>

    <!-- PostgreSQL -->
    <rect x="270" y="50" width="150" height="140" rx="8" fill="url(#dbGrad)" stroke="#2dd4bf" stroke-width="1.5" filter="url(#shadow)" />
    <text x="285" y="80" class="node-title">PostgreSQL</text>
    <text x="285" y="105" class="node-sub">&#8226; Stations Table</text>
    <text x="285" y="125" class="node-sub">&#8226; Coordinates</text>
    <text x="285" y="145" class="node-sub">&#8226; Sensors Meta</text>
    <text x="285" y="165" class="node-sub">&#8226; Audit Logs</text>
  </g>

  <!-- ================= TIER 4: ASYNCHRONOUS RABBITMQ BROKER ================= -->
  <g transform="translate(50, 390)">
    <rect width="700" height="300" rx="12" fill="#0f172a" stroke="#ea580c" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#fb923c">4. RabbitMQ Message Broker (Asynchronous Decoupling &amp; Backpressure)</text>

    <!-- Topic Exchange -->
    <rect x="20" y="55" width="240" height="100" rx="8" fill="url(#rabbitmqGrad)" stroke="#fb923c" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="85" class="node-title">Topic Exchange</text>
    <text x="35" y="108" class="node-sub">`weather.telemetry.topic`</text>
    <text x="35" y="128" class="node-sub">Key: `telemetry.raw.&lt;region&gt;.&lt;id&gt;`</text>
    <text x="35" y="145" class="node-sub">Publisher Confirms: TRUE</text>

    <!-- Durable Queue -->
    <rect x="290" y="55" width="380" height="100" rx="8" fill="#1e293b" stroke="#fb923c" stroke-width="1.5" filter="url(#shadow)" />
    <text x="305" y="85" class="node-title" fill="#fdba74">Queue: `weather.raw.telemetry`</text>
    <text x="305" y="108" class="node-sub">&#8226; Durable disk buffer absorbs 60x burst shock</text>
    <text x="305" y="128" class="node-sub">&#8226; Prefetch Limit: 200 (Consumer backpressure)</text>
    <text x="305" y="145" class="node-sub">&#8226; Manual Acks: on commit only</text>

    <!-- DLQ Exchange & Queue -->
    <rect x="20" y="180" width="650" height="90" rx="8" fill="#1e293b" stroke="#f43f5e" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="210" class="node-title" fill="#fb7185">Dead Letter Exchange &amp; Queue (DLX / DLQ)</text>
    <text x="35" y="235" class="node-sub">`weather.telemetry.dlx` &#8594; `weather.telemetry.dlq`</text>
    <text x="35" y="255" class="node-sub">Isolates corrupted frames &amp; poison pills after 3 failed retries with exponential backoff</text>
  </g>

  <!-- ================= TIER 5: PROCESSING & TIMESCALEDB TIER ================= -->
  <g transform="translate(800, 390)">
    <rect width="750" height="300" rx="12" fill="#0f172a" stroke="#6366f1" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#818cf8">5. Processing &amp; Analytics Tier (Micro-batching &amp; Storage)</text>

    <!-- KEDA Scaler -->
    <rect x="20" y="55" width="220" height="90" rx="8" fill="#1e293b" stroke="#a855f7" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="85" class="node-title" fill="#c084fc">KEDA Autoscaler</text>
    <text x="35" y="108" class="node-sub">Monitors Queue Depth</text>
    <text x="35" y="128" class="node-sub">Scales pods 2 &#8594; 15 replicas</text>

    <!-- Processing Service -->
    <rect x="260" y="55" width="260" height="215" rx="8" fill="url(#procGrad)" stroke="#818cf8" stroke-width="1.5" filter="url(#shadow)" />
    <text x="275" y="85" class="node-title">Processing Service</text>
    <text x="275" y="108" class="node-sub">&#8226; NestJS AMQP Consumer</text>
    <text x="275" y="128" class="node-sub">&#8226; Micro-batch buffer:</text>
    <text x="290" y="148" class="node-sub">(500 records or 250ms)</text>
    <text x="275" y="170" class="node-sub">&#8226; Meteorological Anomaly Engine</text>
    <text x="290" y="190" class="node-sub">(&#916;P &gt; 3 hPa / 3h check)</text>
    <text x="275" y="215" class="node-sub">&#8226; Emits `anomaly.detected`</text>
    <text x="275" y="240" class="node-sub">&#8226; Zero data-loss guarantees</text>

    <!-- TimescaleDB -->
    <rect x="540" y="55" width="190" height="215" rx="8" fill="url(#dbGrad)" stroke="#2dd4bf" stroke-width="1.5" filter="url(#shadow)" />
    <text x="555" y="85" class="node-title">TimescaleDB</text>
    <text x="555" y="108" class="node-sub">&#8226; Hypertable:</text>
    <text x="570" y="128" class="node-sub">`weather_metrics`</text>
    <text x="555" y="150" class="node-sub">&#8226; 1-Day Chunk Interval</text>
    <text x="555" y="172" class="node-sub">&#8226; Continuous Aggregates</text>
    <text x="570" y="192" class="node-sub">(Hourly / Daily rollups)</text>
    <text x="555" y="215" class="node-sub">&#8226; Compression Policy</text>
    <text x="555" y="238" class="node-sub">&#8226; Analytical Read Views</text>
  </g>

  <!-- ================= TIER 6: DYNAMIC CONTROL & QUERY TIER ================= -->
  <g transform="translate(50, 740)">
    <rect width="700" height="150" rx="12" fill="#0f172a" stroke="#ef4444" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#f87171">6. Dynamic Control &amp; Query APIs</text>

    <!-- Alerting & Control Svc -->
    <rect x="20" y="50" width="310" height="80" rx="8" fill="url(#alertGrad)" stroke="#f87171" stroke-width="1.5" filter="url(#shadow)" />
    <text x="35" y="78" class="node-title">Alerting &amp; Control Service</text>
    <text x="35" y="98" class="node-sub">Consumes `weather.anomaly.detected` &#8594; triggers gRPC</text>
    <text x="35" y="116" class="node-sub">UpdateReportingFrequency(1s) to Station Service</text>

    <!-- Query Svc -->
    <rect x="350" y="50" width="320" height="80" rx="8" fill="url(#edgeCardGrad)" stroke="#38bdf8" stroke-width="1.5" filter="url(#shadow)" />
    <text x="365" y="78" class="node-title" fill="#38bdf8">Query &amp; Analytics API Service</text>
    <text x="365" y="98" class="node-sub">REST / GraphQL / gRPC Read Endpoints</text>
    <text x="365" y="116" class="node-sub">Serves dashboards from Timescale continuous rollups</text>
  </g>

  <!-- ================= TIER 7: OBSERVABILITY & CHAOS TESTING ================= -->
  <g transform="translate(800, 740)">
    <rect width="750" height="150" rx="12" fill="#0f172a" stroke="#64748b" stroke-width="1.5" />
    <text x="20" y="30" class="tier-label" fill="#94a3b8">7. Observability, Autoscaling &amp; Chaos Engineering Harness</text>

    <!-- Prometheus & Grafana -->
    <rect x="20" y="50" width="220" height="80" rx="8" fill="url(#obsGrad)" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)" />
    <text x="35" y="78" class="node-title">Prometheus + Grafana</text>
    <text x="35" y="98" class="node-sub">&#8226; Golden signals (Latency/Loss)</text>
    <text x="35" y="116" class="node-sub">&#8226; Queue depth &amp; consumer lag</text>

    <!-- k6 Load Testing -->
    <rect x="260" y="50" width="220" height="80" rx="8" fill="url(#obsGrad)" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)" />
    <text x="275" y="78" class="node-title">Grafana k6 Test Suite</text>
    <text x="275" y="98" class="node-sub">&#8226; 60x Dynamic Spike scenario</text>
    <text x="275" y="116" class="node-sub">&#8226; Fleet growth (1k to 10k VUs)</text>

    <!-- Chaos Testing -->
    <rect x="500" y="50" width="230" height="80" rx="8" fill="url(#obsGrad)" stroke="#94a3b8" stroke-width="1" filter="url(#shadow)" />
    <text x="515" y="78" class="node-title">Toxiproxy / Chaos Runner</text>
    <text x="515" y="98" class="node-sub">&#8226; RabbitMQ crash &amp; resume</text>
    <text x="515" y="116" class="node-sub">&#8226; Database latency backpressure</text>
  </g>

  <!-- ================= CONNECTION PATHWAYS ================= -->

  <!-- Path: Edge -> Ingestion -->
  <path d="M 450 180 L 520 180" fill="none" stroke="#60a5fa" stroke-width="2.5" marker-end="url(#arrow-grpc)" />

  <!-- Path: Ingestion <-> Redis -->
  <path d="M 840 220 L 860 220" fill="none" stroke="#2dd4bf" stroke-width="2" marker-end="url(#arrow-db)" />

  <!-- Path: Ingestion -> Station Service (Direct gRPC) -->
  <path d="M 820 150 L 1110 150" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="6,4" marker-end="url(#arrow-grpc)" />
  <rect x="880" y="132" width="170" height="22" rx="4" fill="#1e293b" stroke="#60a5fa" stroke-width="1" />
  <text x="965" y="148" font-size="11" fill="#93c5fd" text-anchor="middle" font-weight="bold">Direct gRPC ValidateStation()</text>

  <!-- Path: Station Svc -> Postgres -->
  <path d="M 1340 220 L 1380 220" fill="none" stroke="#2dd4bf" stroke-width="2" marker-end="url(#arrow-db)" />

  <!-- Path: Ingestion -> RabbitMQ -->
  <path d="M 680 330 L 680 370 L 170 370 L 170 445" fill="none" stroke="#fb923c" stroke-width="3" marker-end="url(#arrow-amqp)" />
  <rect x="330" y="358" width="220" height="22" rx="4" fill="#1e293b" stroke="#fb923c" stroke-width="1" />
  <text x="440" y="374" font-size="11" fill="#fdba74" text-anchor="middle" font-weight="bold">AMQP: Publisher Confirms (&lt;15ms)</text>

  <!-- Path: Topic -> Queue -->
  <path d="M 260 495 L 290 495" fill="none" stroke="#fb923c" stroke-width="2.5" marker-end="url(#arrow-amqp)" />

  <!-- Path: Queue -> Processing Svc -->
  <path d="M 670 495 L 1060 495" fill="none" stroke="#fb923c" stroke-width="3" marker-end="url(#arrow-amqp)" />
  <rect x="750" y="483" width="220" height="22" rx="4" fill="#1e293b" stroke="#fb923c" stroke-width="1" />
  <text x="860" y="499" font-size="11" fill="#fdba74" text-anchor="middle" font-weight="bold">Consume (Prefetch: 200, Manual Ack)</text>

  <!-- Path: Processing Svc -> TimescaleDB -->
  <path d="M 1320 540 L 1340 540" fill="none" stroke="#2dd4bf" stroke-width="2.5" marker-end="url(#arrow-db)" />

  <!-- Path: KEDA -> Processing Svc -->
  <path d="M 1020 500 L 1060 500" fill="none" stroke="#c084fc" stroke-width="2" stroke-dasharray="4,3" />

  <!-- Path: Processing Svc Anomaly -> RabbitMQ / Alert Svc -->
  <path d="M 1190 665 L 1190 715 L 220 715 L 220 790" fill="none" stroke="#f87171" stroke-width="2.5" stroke-dasharray="6,4" marker-end="url(#arrow-alert)" />
  <rect x="580" y="703" width="260" height="22" rx="4" fill="#1e293b" stroke="#f87171" stroke-width="1" />
  <text x="710" y="719" font-size="11" fill="#fca5a5" text-anchor="middle" font-weight="bold">Event: weather.anomaly.detected (&#916;P Drop)</text>

  <!-- Path: Alert Svc -> Station Svc (gRPC UpdateFrequency) -->
  <path d="M 170 790 L 170 710 L 30 710 L 30 110 L 1225 110 L 1225 170" fill="none" stroke="#f87171" stroke-width="2.5" stroke-dasharray="6,4" marker-end="url(#arrow-alert)" />
  <rect x="420" y="98" width="340" height="24" rx="4" fill="#1e293b" stroke="#f87171" stroke-width="1.5" />
  <text x="590" y="115" font-size="12" fill="#fca5a5" text-anchor="middle" font-weight="bold">Dynamic Loop: gRPC UpdateReportingFrequency(1s)</text>

  <!-- Path: Station Svc -> Edge Stations Broadcast -->
  <path d="M 1110 200 L 450 200" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="4,4" marker-end="url(#arrow-gray)" />

  <!-- Path: Query Svc -> TimescaleDB -->
  <path d="M 720 830 L 1380 830 L 1380 665" fill="none" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow-grpc)" />

  <!-- ================= LEGEND BAR ================= -->
  <g transform="translate(50, 930)">
    <rect width="1500" height="100" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
    <text x="25" y="30" font-size="14" font-weight="700" fill="#94a3b8" letter-spacing="1">COMMUNICATION &amp; INTERACTION LEGEND:</text>

    <!-- Legend 1 -->
    <line x1="30" y1="65" x2="70" y2="65" stroke="#60a5fa" stroke-width="3" stroke-dasharray="6,3" />
    <polygon points="70,62 76,65 70,68" fill="#60a5fa" />
    <text x="85" y="69" class="legend-text">Direct Synchronous gRPC (Low-latency Protobuf)</text>

    <!-- Legend 2 -->
    <line x1="430" y1="65" x2="470" y2="65" stroke="#fb923c" stroke-width="3" />
    <polygon points="470,62 476,65 470,68" fill="#fb923c" />
    <text x="485" y="69" class="legend-text">Asynchronous RabbitMQ (Topic Decoupling, Confirms &amp; Backpressure)</text>

    <!-- Legend 3 -->
    <line x1="970" y1="65" x2="1010" y2="65" stroke="#2dd4bf" stroke-width="3" />
    <polygon points="1010,62 1016,65 1010,68" fill="#2dd4bf" />
    <text x="1025" y="69" class="legend-text">Batch Database Persistence / Fast Redis Cache I/O</text>

    <!-- Legend 4 -->
    <line x1="30" y1="90" x2="70" y2="90" stroke="#f87171" stroke-width="3" stroke-dasharray="6,3" />
    <polygon points="70,87 76,90 70,93" fill="#f87171" />
    <text x="85" y="94" class="legend-text">Dynamic Surge Feedback Loop (Extreme Weather Trigger &#8594; 60x Frequency)</text>

    <!-- Legend 5 -->
    <line x1="560" y1="90" x2="600" y2="90" stroke="#f43f5e" stroke-width="3" />
    <polygon points="600,87 606,90 600,93" fill="#f43f5e" />
    <text x="615" y="94" class="legend-text">Dead-Letter Queue (DLQ / Poison Pill Isolation)</text>

    <!-- Legend 6 -->
    <line x1="970" y1="90" x2="1010" y2="90" stroke="#c084fc" stroke-width="3" stroke-dasharray="4,3" />
    <text x="1025" y="94" class="legend-text">KEDA Event-Driven Horizontal Autoscaling (Queue Depth)</text>
  </g>
</svg>"""
    return svg

def main():
    prompt_dir = Path(__file__).resolve().parent
    output_path = prompt_dir / "system-architecture-diagram.svg"
    svg_content = generate_svg()

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

    print(f"✅ Architecture diagram successfully generated at: {output_path}")

if __name__ == "__main__":
    main()
