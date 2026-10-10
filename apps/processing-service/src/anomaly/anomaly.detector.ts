import { Injectable } from '@nestjs/common';
import { TelemetryPayload, AnomalyEventPayload } from '@libs/contracts';
import { AppLogger } from '@libs/common';

interface StationHistory {
  lastPressure: number;
  lastTimestamp: number;
}

@Injectable()
export class AnomalyDetector {
  private history = new Map<string, StationHistory>();

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('AnomalyDetector');
  }

  evaluate(payload: TelemetryPayload): AnomalyEventPayload | null {
    const prev = this.history.get(payload.station_id);
    const now = payload.timestamp || Date.now();

    // 1. Severe Barometric Drop Check (ΔP > 3 hPa indicator of hurricane or sudden storm front)
    if (prev && prev.lastPressure) {
      const deltaPressure = prev.lastPressure - payload.pressure;
      // If pressure dropped more than 3 hPa
      if (deltaPressure >= 3.0) {
        this.logger.warn(
          `⚠️ METEOROLOGICAL ANOMALY: Rapid pressure drop detected at ${payload.station_id}: ΔP = -${deltaPressure.toFixed(1)} hPa`
        );
        this.history.set(payload.station_id, { lastPressure: payload.pressure, lastTimestamp: now });
        return {
          anomaly_id: `anom-${Date.now()}-${payload.station_id}`,
          station_id: payload.station_id,
          timestamp: now,
          metric: 'pressure',
          value: payload.pressure,
          threshold: 3.0,
          description: `Rapid pressure drop of ${deltaPressure.toFixed(1)} hPa detected (storm front imminent)`,
          severity: 'CRITICAL',
        };
      }
    }

    // 2. Extreme Sustained Wind Gusts (> 30 m/s = 108 km/h)
    if (payload.wind_speed >= 30.0) {
      this.logger.warn(`⚠️ METEOROLOGICAL ANOMALY: Extreme wind speed ${payload.wind_speed} m/s at ${payload.station_id}`);
      this.history.set(payload.station_id, { lastPressure: payload.pressure, lastTimestamp: now });
      return {
        anomaly_id: `anom-${Date.now()}-${payload.station_id}`,
        station_id: payload.station_id,
        timestamp: now,
        metric: 'wind_speed',
        value: payload.wind_speed,
        threshold: 30.0,
        description: `Severe gale / hurricane wind speed of ${payload.wind_speed} m/s detected`,
        severity: 'EMERGENCY',
      };
    }

    this.history.set(payload.station_id, { lastPressure: payload.pressure, lastTimestamp: now });
    return null;
  }
}
