import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppLogger } from '@libs/common';
import { ValidateStationResponse, StationStatus } from '@libs/contracts';

@Injectable()
export class StationCacheService implements OnModuleInit, OnApplicationShutdown {
  private redisClient?: Redis;
  private localFallback = new Map<string, { data: ValidateStationResponse; expiresAt: number }>();

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('StationCacheService');
  }

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });

      this.redisClient.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}. Using in-memory cache.`);
      });

      await this.redisClient.connect();
      this.logger.log('✅ Connected to Redis cache');
    } catch (err: any) {
      this.logger.warn(`Redis not available (${err.message}). Using local in-memory TTL cache.`);
      this.redisClient = undefined;
    }
  }

  async get(stationId: string): Promise<ValidateStationResponse | null> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const cached = await this.redisClient.get(`station:${stationId}:valid`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err: any) {
        this.logger.warn(`Redis GET failed: ${err.message}`);
      }
    }

    const local = this.localFallback.get(stationId);
    if (local && local.expiresAt > Date.now()) {
      return local.data;
    }
    return null;
  }

  async set(stationId: string, data: ValidateStationResponse, ttlSeconds = 300): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.setex(`station:${stationId}:valid`, ttlSeconds, JSON.stringify(data));
        return;
      } catch (err: any) {
        this.logger.warn(`Redis SETEX failed: ${err.message}`);
      }
    }

    this.localFallback.set(stationId, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async onApplicationShutdown() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
