import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { Observable, Subject } from 'rxjs';
import { IngestionService } from './ingestion.service';
import {
  TelemetryPayload,
  IngestionAck,
  IngestionStatusCode,
} from '@libs/contracts';
import { LoggingInterceptor } from '@libs/common';

@Controller()
@UseInterceptors(LoggingInterceptor)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  // 1. gRPC Unary Endpoint
  @GrpcMethod('WeatherIngestionService', 'SubmitTelemetry')
  async submitTelemetryGrpc(data: TelemetryPayload): Promise<IngestionAck> {
    return this.ingestionService.processTelemetry(data);
  }

  // 2. gRPC Client Streaming Endpoint (High-Frequency Burst Uplink)
  @GrpcStreamMethod('WeatherIngestionService', 'StreamTelemetry')
  streamTelemetryGrpc(messages: Observable<TelemetryPayload>): Observable<IngestionAck> {
    const subject = new Subject<IngestionAck>();

    messages.subscribe({
      next: async (payload) => {
        try {
          const ack = await this.ingestionService.processTelemetry(payload);
          subject.next(ack);
        } catch (err: any) {
          subject.next({
            code: IngestionStatusCode.REJECTED,
            message: err.message,
            server_timestamp: Date.now(),
          });
        }
      },
      complete: () => subject.complete(),
      error: (err) => subject.error(err),
    });

    return subject.asObservable();
  }

  // 3. HTTP REST Gateway Fallback
  @Post('api/v1/telemetry')
  @HttpCode(HttpStatus.OK)
  async submitTelemetryHttp(@Body() body: TelemetryPayload): Promise<IngestionAck> {
    return this.ingestionService.processTelemetry(body);
  }

  // 4. Kubernetes Health Probes
  @Get('health')
  getHealth() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      service: 'ingestion-service',
    };
  }

  @Get('health/live')
  getLiveness() {
    return { status: 'UP' };
  }

  @Get('health/ready')
  getReadiness() {
    return { status: 'UP' };
  }
}
