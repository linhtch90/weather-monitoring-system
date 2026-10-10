import { Injectable, BadRequestException } from '@nestjs/common';
import {
  TelemetryPayload,
  IngestionAck,
  IngestionStatusCode,
} from '@libs/contracts';
import { RabbitMQService, RABBITMQ_CONSTANTS } from '@libs/rabbitmq';
import { StationCacheService } from './cache/station-cache.service';
import { StationGrpcClient } from './grpc-clients/station-grpc.client';
import { AppLogger } from '@libs/common';

@Injectable()
export class IngestionService {
  constructor(
    private readonly rabbitmqService: RabbitMQService,
    private readonly cacheService: StationCacheService,
    private readonly grpcClient: StationGrpcClient,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('IngestionService');
  }

  async processTelemetry(payload: TelemetryPayload): Promise<IngestionAck> {
    const startTime = Date.now();

    // 1. Fast Semantic & Physical Range Validation
    this.validateTelemetryRanges(payload);

    // 2. Station Verification (Cache-aside with Circuit Breaker gRPC)
    let stationValidation = await this.cacheService.get(payload.station_id);
    if (!stationValidation) {
      stationValidation = await this.grpcClient.validateStation({
        station_id: payload.station_id,
        api_key: payload.api_key || '',
      });
      if (stationValidation.is_valid) {
        await this.cacheService.set(payload.station_id, stationValidation, 300);
      }
    }

    if (!stationValidation.is_valid) {
      return {
        code: IngestionStatusCode.REJECTED,
        message: stationValidation.error_message || 'Station validation failed or station inactive',
        server_timestamp: Date.now(),
      };
    }

    // 3. Construct Routing Key: telemetry.raw.<region>.<stationId>
    const region = this.extractRegion(payload.station_id);
    const routingKey = `${RABBITMQ_CONSTANTS.ROUTING_KEYS.TELEMETRY_RAW_PREFIX}.${region}.${payload.station_id}`;

    // 4. Asynchronous Publish with Publisher Confirms
    try {
      await this.rabbitmqService.publishTelemetry(routingKey, payload);
    } catch (err: any) {
      this.logger.error(`Failed to publish telemetry to RabbitMQ: ${err.message}`, err.stack);
      return {
        code: IngestionStatusCode.DEGRADED,
        message: 'Message broker temporarily unavailable, backpressure applied',
        server_timestamp: Date.now(),
      };
    }

    const duration = Date.now() - startTime;
    this.logger.debug?.(`Ingested payload for ${payload.station_id} in ${duration}ms`);

    return {
      code: IngestionStatusCode.SUCCESS,
      message: 'Telemetry successfully ingested and queued for analysis',
      server_timestamp: Date.now(),
    };
  }

  private validateTelemetryRanges(payload: TelemetryPayload) {
    if (!payload.station_id) {
      throw new BadRequestException('station_id is required');
    }
    if (payload.temperature < -90 || payload.temperature > 60) {
      throw new BadRequestException(`Temperature ${payload.temperature}°C out of realistic range (-90 to +60)`);
    }
    if (payload.humidity < 0 || payload.humidity > 100) {
      throw new BadRequestException(`Humidity ${payload.humidity}% out of range (0 to 100)`);
    }
    if (payload.pressure < 800 || payload.pressure > 1100) {
      throw new BadRequestException(`Pressure ${payload.pressure} hPa out of realistic range (800 to 1100)`);
    }
    if (payload.wind_speed < 0 || payload.wind_speed > 150) {
      throw new BadRequestException(`Wind speed ${payload.wind_speed} m/s out of range`);
    }
    if (payload.wind_direction < 0 || payload.wind_direction > 359) {
      throw new BadRequestException(`Wind direction ${payload.wind_direction}° out of range (0 to 359)`);
    }
  }

  private extractRegion(stationId: string): string {
    const parts = stationId.split('-');
    if (parts.length >= 2) {
      return parts[1].toLowerCase();
    }
    return 'global';
  }
}
