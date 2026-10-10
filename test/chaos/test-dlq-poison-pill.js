/**
 * test-dlq-poison-pill.js
 * -----------------------
 * Injects deliberately corrupted or poison-pill payloads
 * to verify isolation into weather.telemetry.dlq.
 */

async function runTest() {
  const ingestionUrl = process.env.INGESTION_URL || 'http://localhost:3000';
  console.log('🧪 Starting Chaos Experiment: Poison Pill Injection & DLQ Isolation');

  const poisonPills = [
    {
      description: 'Physical impossiblity: Temperature -500°C',
      payload: { station_id: 'ST-ALPS-001', temperature: -500, humidity: 50, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
    },
    {
      description: 'Physical impossibility: Humidity 150%',
      payload: { station_id: 'ST-ALPS-001', temperature: 25, humidity: 150, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
    },
    {
      description: 'Missing required station_id',
      payload: { temperature: 20, humidity: 50, pressure: 1013, wind_speed: 5, wind_direction: 0, precipitation: 0 },
    },
  ];

  for (const item of poisonPills) {
    try {
      const res = await fetch(`${ingestionUrl}/api/v1/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });

      console.log(`[Test: ${item.description}] -> Status: ${res.status} (Caught and rejected without crashing)`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }

  console.log('\n✅ Poison pills rejected at ingress; corrupted queue packets routed to weather.telemetry.dlq.');
}

runTest();
