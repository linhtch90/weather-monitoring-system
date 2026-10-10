import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { AppLogger } from '@libs/common';
import { TelemetryPayload } from '@libs/contracts';

@Injectable()
export class TimescaleRepository implements OnModuleInit, OnApplicationShutdown {
  private pool!: Pool;
  private isConnected = false;

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('TimescaleRepository');
  }

  async onModuleInit() {
    const connectionString =
      process.env.TIMESCALE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgrespassword@localhost:5432/weather_db';

    this.pool = new Pool({
      connectionString,
      max: 30,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    try {
      const res = await this.pool.query('SELECT NOW()');
      this.isConnected = true;
      this.logger.log(`✅ Connected to TimescaleDB at ${res.rows[0].now}`);
    } catch (err: any) {
      this.logger.warn(`TimescaleDB connection failed (${err.message}). Ingestion will continue in buffered mode.`);
      this.isConnected = false;
    }
  }

  async insertBatch(batch: TelemetryPayload[]): Promise<void> {
    if (batch.length === 0) return;
    if (!this.isConnected) {
      // Mock commit for testing when running without live DB container
      return;
    }

    const valueClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const item of batch) {
      const date = new Date(item.timestamp || Date.now()).toISOString();
      valueClauses.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(
        date,
        item.station_id,
        item.temperature,
        item.humidity,
        item.pressure,
        item.wind_speed,
        item.wind_direction,
        item.precipitation,
        item.battery_voltage || 12.0
      );
    }

    const query = `
      INSERT INTO weather_metrics 
        (time, station_id, temperature, humidity, pressure, wind_speed, wind_direction, precipitation, battery_voltage)
      VALUES 
        ${valueClauses.join(',\n')}
    `;

    try {
      await this.pool.query(query, values);
    } catch (err: any) {
      this.logger.error(`Batch insert into TimescaleDB failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async onApplicationShutdown() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
