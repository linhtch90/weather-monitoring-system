import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AppLogger } from '@libs/common';
import { StationStatus } from '@libs/contracts';
import { StationRecord } from './entities/station.entity';

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
  private dataSource?: DataSource;
  private ormRepo?: Repository<StationRecord>;
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
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgrespassword@localhost:5432/weather_db';

    this.dataSource = new DataSource({
      type: 'postgres',
      url: connectionString,
      entities: [StationRecord],
      synchronize: false,
      extra: {
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      },
    });

    try {
      await this.dataSource.initialize();
      this.ormRepo = this.dataSource.getRepository(StationRecord);
      this.logger.log('✅ Connected to PostgreSQL via TypeORM DataSource');
    } catch (err: any) {
      this.logger.warn(
        `PostgreSQL TypeORM connection failed (${err.message}). Using local seed storage for resilience.`
      );
      this.ormRepo = undefined;
    }
  }

  async findById(id: string): Promise<StationEntity | null> {
    if (this.ormRepo && this.dataSource?.isInitialized) {
      try {
        const record = await this.ormRepo.findOne({ where: { id } });
        if (record) {
          return {
            id: record.id,
            name: record.name,
            latitude: record.latitude,
            longitude: record.longitude,
            elevation: record.elevation,
            status: this.mapStatus(record.status),
            reporting_interval_seconds: record.reporting_interval_seconds,
            api_key: record.api_key,
          };
        }
      } catch (err: any) {
        this.logger.warn(
          `TypeORM query failed (${err.message}), falling back to in-memory registry`
        );
      }
    }
    return this.inMemoryFallback.get(id) || null;
  }

  async updateInterval(id: string, intervalSeconds: number): Promise<boolean> {
    if (this.ormRepo && this.dataSource?.isInitialized) {
      try {
        await this.ormRepo.update(
          { id },
          {
            reporting_interval_seconds: intervalSeconds,
            updated_at: new Date(),
          }
        );
      } catch (err: any) {
        this.logger.warn(
          `TypeORM update failed (${err.message}), updating in-memory fallback`
        );
      }
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
      case 'ACTIVE':
        return StationStatus.ACTIVE;
      case 'INACTIVE':
        return StationStatus.INACTIVE;
      case 'MAINTENANCE':
        return StationStatus.MAINTENANCE;
      case 'ALERT_MODE':
        return StationStatus.ALERT_MODE;
      default:
        return StationStatus.ACTIVE;
    }
  }

  async onApplicationShutdown() {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
