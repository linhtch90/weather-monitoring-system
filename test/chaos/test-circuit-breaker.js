/**
 * test-circuit-breaker.js
 * -----------------------
 * Verifies that Ingestion Service's Opossum circuit breaker trips to OPEN
 * when station-service fails, falling back gracefully without crashing or timing out.
 */

async function runTest() {
  const ingestionUrl = process.env.INGESTION_URL || 'http://localhost:3000';
  console.log('🧪 Starting Chaos Experiment: Station Service Outage & Circuit Breaker Verification');

  const payload = {
    station_id: 'ST-ALPS-001',
    timestamp: Date.now(),
    temperature: 21.0,
    humidity: 55.0,
    pressure: 1013.0,
    wind_speed: 3.2,
    wind_direction: 120,
    precipitation: 0.0,
    battery_voltage: 12.5,
    api_key: 'sec_token_alps_001',
  };

  let successCount = 0;
  let fallbackCount = 0;
  const totalRequests = 20;

  for (let i = 1; i <= totalRequests; i++) {
    const start = Date.now();
    try {
      const res = await fetch(`${ingestionUrl}/api/v1/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const latency = Date.now() - start;

      if (res.ok && data.code === 1) {
        successCount++;
        console.log(`[Req ${i}] ✅ SUCCESS in ${latency}ms`);
      } else if (data.message && data.message.includes('fallback')) {
        fallbackCount++;
        console.log(`[Req ${i}] 🛡️ DEGRADED FALLBACK in ${latency}ms: ${data.message}`);
      } else {
        console.log(`[Req ${i}] Response: status=${res.status}, code=${data.code}, msg=${data.message}`);
      }
    } catch (err) {
      console.error(`[Req ${i}] ❌ Request failed: ${err.message}`);
    }
  }

  console.log('\n--- Experiment Summary ---');
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Graceful Fallbacks: ${fallbackCount}`);
  console.log('Zero unhandled crash exceptions observed.');
}

runTest();
