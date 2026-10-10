import http from 'k6/http';
import { check, sleep } from 'k6';

// 60x Dynamic Frequency Burst Simulation:
// Stations normally emit 1 req every 60s.
// When severe weather hits, stations accelerate to 1 req every 1s.
export const options = {
  scenarios: {
    baseline_and_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 20, // Baseline: ~20 req/s across fleet
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1500,
      stages: [
        { duration: '30s', target: 20 },   // Warmup / Baseline (60s mode)
        { duration: '15s', target: 600 },  // 30x Surge: Severe storm front approaches
        { duration: '1m',  target: 1200 }, // 60x Burst: 1,200 req/sec sustained
        { duration: '30s', target: 20 },   // Normalization / Recovery back to 60s
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<150'], // Ingestion latency must remain ultra-fast
    http_req_failed: ['rate<0.001'],               // <0.1% failure tolerance
  },
};

const BASE_URL = __ENV.INGESTION_URL || 'http://localhost:3000';

const STATIONS = ['ST-ALPS-001', 'ST-PACIFIC-002', 'ST-SAHARA-003'];

export default function () {
  const stationId = STATIONS[Math.floor(Math.random() * STATIONS.length)];
  const isStorm = Math.random() < 0.2; // 20% probability of storm readings

  const payload = JSON.stringify({
    station_id: stationId,
    timestamp: Date.now(),
    temperature: 18.5 + (Math.random() * 5 - 2.5),
    humidity: 65.0 + (Math.random() * 10 - 5),
    pressure: isStorm ? 998.0 : 1013.2 + (Math.random() * 4 - 2), // Sudden drop when storm
    wind_speed: isStorm ? 32.5 : 5.0 + Math.random() * 8,          // High gusts when storm
    wind_direction: Math.floor(Math.random() * 360),
    precipitation: isStorm ? 15.0 : 0.0,
    battery_voltage: 12.6,
    api_key: 'sec_token_alps_001',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/api/v1/telemetry`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'ingestion code SUCCESS': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.code === 1; // IngestionStatusCode.SUCCESS
      } catch {
        return false;
      }
    },
  });
}
