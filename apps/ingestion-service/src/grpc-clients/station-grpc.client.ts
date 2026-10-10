import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import {
  ValidateStationRequest,
  ValidateStationResponse,
  StationStatus,
} from '@libs/contracts';
import { AppLogger, createCircuitBreaker } from '@libs/common';
import CircuitBreaker from 'opossum';

interface StationGrpcService {
  validateStation(data: ValidateStationRequest): Observable<ValidateStationResponse>;
}

@Injectable()
export class StationGrpcClient implements OnModuleInit {
  private grpcService!: StationGrpcService;
  private breaker!: CircuitBreaker<[ValidateStationRequest], ValidateStationResponse>;

  constructor(
    @Inject('STATION_GRPC_PACKAGE') private readonly client: ClientGrpc,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StationGrpcClient');
  }

  onModuleInit() {
    this.grpcService = this.client.getService<StationGrpcService>('StationService');

    // Initialize Circuit Breaker
    this.breaker = createCircuitBreaker(
      async (req: ValidateStationRequest) => {
        return await firstValueFrom(this.grpcService.validateStation(req));
      },
      {
        timeout: 2000,
        errorThresholdPercentage: 50,
        resetTimeout: 5000,
        name: 'StationGrpcCircuitBreaker',
      },
      // Fallback: Tentatively permit if station ID conforms to pattern
      async (req: ValidateStationRequest): Promise<ValidateStationResponse> => {
        this.logger.warn(`Circuit Breaker fallback invoked for station ${req.station_id}`);
        const isValidFormat = /^ST-[A-Z0-9-]+$/.test(req.station_id);
        return {
          is_valid: isValidFormat,
          status: StationStatus.ACTIVE,
          reporting_interval_seconds: 60,
          error_message: 'Station service in degraded mode (fallback applied)',
        };
      },
      this.logger,
    );
  }

  async validateStation(request: ValidateStationRequest): Promise<ValidateStationResponse> {
    return this.breaker.fire(request);
  }
}
