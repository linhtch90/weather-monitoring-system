import { Controller, UseFilters, UseInterceptors } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { StationService } from './station.service';
import {
  ValidateStationRequest,
  ValidateStationResponse,
  GetStationConfigRequest,
  StationConfigResponse,
  UpdateReportingFrequencyRequest,
  UpdateReportingFrequencyResponse,
} from '@libs/contracts';
import { GrpcServerExceptionFilter, LoggingInterceptor } from '@libs/common';

@Controller()
@UseFilters(new GrpcServerExceptionFilter())
@UseInterceptors(LoggingInterceptor)
export class StationController {
  constructor(private readonly stationService: StationService) {}

  @GrpcMethod('StationService', 'ValidateStation')
  async validateStation(data: ValidateStationRequest): Promise<ValidateStationResponse> {
    return this.stationService.validateStation(data);
  }

  @GrpcMethod('StationService', 'GetStationConfig')
  async getStationConfig(data: GetStationConfigRequest): Promise<StationConfigResponse> {
    return this.stationService.getStationConfig(data);
  }

  @GrpcMethod('StationService', 'UpdateReportingFrequency')
  async updateReportingFrequency(
    data: UpdateReportingFrequencyRequest,
  ): Promise<UpdateReportingFrequencyResponse> {
    return this.stationService.updateReportingFrequency(data);
  }
}
