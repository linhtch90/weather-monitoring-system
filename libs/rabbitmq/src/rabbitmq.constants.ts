export const RABBITMQ_CONSTANTS = {
  EXCHANGES: {
    TELEMETRY_TOPIC: 'weather.telemetry.topic',
    TELEMETRY_DLX: 'weather.telemetry.dlx',
  },
  QUEUES: {
    RAW_TELEMETRY: 'weather.raw.telemetry',
    TELEMETRY_DLQ: 'weather.telemetry.dlq',
    ANOMALY_EVENTS: 'weather.anomaly.events',
  },
  ROUTING_KEYS: {
    TELEMETRY_RAW_PATTERN: 'telemetry.raw.#',
    TELEMETRY_RAW_PREFIX: 'telemetry.raw',
    ANOMALY_DETECTED: 'weather.anomaly.detected',
  },
  PREFETCH: {
    DEFAULT: 200,
  },
};
