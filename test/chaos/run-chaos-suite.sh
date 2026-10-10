#!/usr/bin/env bash
set -e

echo "=================================================="
echo "⚡ RUNNING WEATHER SYSTEM CHAOS & RESILIENCE SUITE"
echo "=================================================="

echo ""
echo "1. Testing Ingestion Circuit Breaker..."
node test/chaos/test-circuit-breaker.js

echo ""
echo "2. Testing Poison Pill Rejection & DLQ..."
node test/chaos/test-dlq-poison-pill.js

echo ""
echo "✅ All resilience experiments completed successfully."
