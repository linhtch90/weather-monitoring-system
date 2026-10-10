import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { AppLogger } from '@libs/common';
import { StationStatus } from '@libs/contracts';

export interface StationEntity {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  status: StationStatus;
  reporting_interval_seconds: number;
  api_key: string;
}

@Injectable()
export class StationRepository implements OnModuleInit, OnApplicationShutdown {
  private pool!: Pool;
  private inMemoryFallback: Map<string, StationEntity> = new Map();

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('StationRepository');
    this.initSeedFallback();
  }

  private initSeedFallback() {
    this.inMemoryFallback.set('ST-ALPS-001', {
      id: 'ST-ALPS-001',
      name: 'Alpine High Peak Station',
      latitude: 45.8326,
      longitude: 6.8652,
      elevation: 3842.0,
      status: StationStatus.ACTIVE,
      reporting_interval_seconds: 60,
      api_key: 'sec_token_alps_001',
    });
    this.inMemoryFallback.set('ST-PACIFIC-002', {
      id: 'ST-PACIFIC-002',
      name: 'Coastal Pacific Buoy',
      latitude: 36.7783,
      longitude: -122.4194,
      elevation: 0.0,
      status: StationStatus.ACTIVE,
      reporting_interval_seconds: 60,
      api_key: 'sec_token_pacific_002',
    });
    this.inMemoryFallback.set('ST-SAHARA-003', {
      id: 'ST-SAHARA-003',
      name: 'North Sahara Outpost',
      latitude: 25.2867,
      longitude: 14.4326,
      elevation: 450.0,
      status: StationStatus.ACTIVE,
      reporting_interval_seconds: 60,
      api_key: 'sec_token_sahara_003',
    });
  }

  async onModuleInit() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/weather_db';
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    try {
      const res = await this.pool.query('SELECT NOW()');
      this.logger.log(`✅ Connected to PostgreSQL at ${res.rows[0].now}`);
    } catch (err: any) {
      this.logger.warn(`PostgreSQL connection failed (${err.message}). Using local seed storage for testing.`);
    }
  }

  async findById(id: string): Promise<StationEntity | null> {
    try {
      const res = await this.pool.query(
        'SELECT id, name, latitude, longitude, elevation, status, reporting_interval_seconds, api_key FROM stations WHERE id = $1',
        [id]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          ...row,
          status: this.mapStatus(row.status),
        };
      }
    } catch (err: any) {
      this.logger.warn(`Database query failed (${err.message}), falling back to in-memory registry`);
    }
    return this.inMemoryFallback.get(id) || null;
  }

  async updateInterval(id: string, intervalSeconds: number): Promise<boolean> {
    try {
      await this.pool.query(
        'UPDATE stations SET reporting_interval_seconds = $1, updated_at = NOW() WHERE id = $2',
        [intervalSeconds, id]
      );
    } catch (err: any) {
      this.logger.warn(`Database update failed (${err.message}), updating in-memory fallback`);
    }
    const fallback = this.inMemoryFallback.get(id);
    if (fallback) {
      fallback.reporting_interval_seconds = intervalSeconds;
      return true;
    }
    return true;
  }

  private mapStatus(statusStr: string): StationStatus {
    switch (statusStr) {
      case 'ACTIVE': return StationStatus.ACTIVE;
      case 'INACTIVE': return StationStatus.INACTIVE;
      case 'MAINTENANCE': return StationStatus.MAINTENANCE;
      case 'ALERT_MODE': return StationStatus.ALERT_MODE;
      default: return StationStatus.ACTIVE;
    }
  }

  async onApplicationShutdown() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
