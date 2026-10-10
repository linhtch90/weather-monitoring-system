import { join, resolve } from 'path';
import { existsSync } from 'fs';

export const STATION_PACKAGE_NAME = 'weather.station.v1';
export const TELEMETRY_PACKAGE_NAME = 'weather.telemetry.v1';

export function resolveProtoPath(protoFile: string): string {
  const candidatePaths = [
    // 1. Check local directory (if assets were copied to dist)
    join(__dirname, 'proto', protoFile),
    // 2. Check from project root (development / watch mode)
    resolve(process.cwd(), 'libs/contracts/src/proto', protoFile),
    // 3. Check relative to compiled dist directory
    resolve(__dirname, '../../../../../libs/contracts/src/proto', protoFile),
    resolve(__dirname, '../../../../libs/contracts/src/proto', protoFile),
    resolve(__dirname, '../../../libs/contracts/src/proto', protoFile),
  ];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return join(__dirname, 'proto', protoFile);
}

export const STATION_PROTO_PATH = resolveProtoPath('station.proto');
export const TELEMETRY_PROTO_PATH = resolveProtoPath('telemetry.proto');

export enum StationStatus {
  UNSPECIFIED = 0,
  ACTIVE = 1,
  INACTIVE = 2,
  MAINTENANCE = 3,
  ALERT_MODE = 4,
}

export interface ValidateStationRequest {
  station_id: string;
  api_key: string;
}

export interface ValidateStationResponse {
  is_valid: boolean;
  status: StationStatus;
  reporting_interval_seconds: number;
  error_message?: string;
}

export interface GetStationConfigRequest {
  station_id: string;
}

export interface StationConfigResponse {
  station_id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  status: StationStatus;
  reporting_interval_seconds: number;
}

export interface UpdateReportingFrequencyRequest {
  station_id: string;
  frequency_seconds: number;
  reason: string;
}

export interface UpdateReportingFrequencyResponse {
  success: boolean;
  station_id: string;
  new_frequency_seconds: number;
  message: string;
}

export interface TelemetryPayload {
  station_id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  pressure: number;
  wind_speed: number;
  wind_direction: number;
  precipitation: number;
  battery_voltage?: number;
  firmware_version?: string;
  api_key?: string;
}

export enum IngestionStatusCode {
  UNSPECIFIED = 0,
  SUCCESS = 1,
  REJECTED = 2,
  RATE_LIMITED = 3,
  DEGRADED = 4,
}

export interface IngestionAck {
  code: IngestionStatusCode;
  message: string;
  server_timestamp: number;
}

export interface AnomalyEventPayload {
  anomaly_id: string;
  station_id: string;
  timestamp: number;
  metric: string;
  value: number;
  threshold: number;
  description: string;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
}
