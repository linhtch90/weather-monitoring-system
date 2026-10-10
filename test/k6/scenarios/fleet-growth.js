import http from 'k6/http';
import { check, sleep } from 'k6';

// Fleet Scaling Scenario:
// Simulates growing the client fleet from 500 to 5,000 active monitoring stations.
export const options = {
  stages: [
    { duration: '30s', target: 500 },  // 500 concurrent stations
    { duration: '1m',  target: 2000 }, // Ramp to 2,000 stations
    { duration: '1m',  target: 5000 }, // Peak at 5,000 stations
    { duration: '30s', target: 500 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.INGESTION_URL || 'http://localhost:3000';

export default function () {
  const stationNum = (__VU % 1000) + 1;
  const stationId = `ST-REGIONAL-${stationNum.toString().padStart(4, '0')}`;

  const payload = JSON.stringify({
    station_id: stationId,
    timestamp: Date.now(),
    temperature: 20.0,
    humidity: 50.0,
    pressure: 1012.0,
    wind_speed: 4.5,
    wind_direction: 180,
    precipitation: 0.0,
    battery_voltage: 12.4,
    api_key: 'sec_token_alps_001',
  });

  const res = http.post(`${BASE_URL}/api/v1/telemetry`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
