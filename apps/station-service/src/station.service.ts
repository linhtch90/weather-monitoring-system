import { Injectable } from '@nestjs/common';
import { StationRepository } from './station.repository';
import {
  ValidateStationRequest,
  ValidateStationResponse,
  GetStationConfigRequest,
  StationConfigResponse,
  UpdateReportingFrequencyRequest,
  UpdateReportingFrequencyResponse,
  StationStatus,
} from '@libs/contracts';
import { AppLogger } from '@libs/common';

@Injectable()
export class StationService {
  constructor(
    private readonly repository: StationRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('StationService');
  }

  async validateStation(request: ValidateStationRequest): Promise<ValidateStationResponse> {
    const station = await this.repository.findById(request.station_id);

    if (!station) {
      this.logger.warn(`Validation failed: station ${request.station_id} not found`);
      return {
        is_valid: false,
        status: StationStatus.UNSPECIFIED,
        reporting_interval_seconds: 0,
        error_message: 'Station not found',
      };
    }

    if (request.api_key && station.api_key !== request.api_key) {
      this.logger.warn(`Validation failed: invalid API key for station ${request.station_id}`);
      return {
        is_valid: false,
        status: station.status,
        reporting_interval_seconds: station.reporting_interval_seconds,
        error_message: 'Invalid API key',
      };
    }

    return {
      is_valid: station.status === StationStatus.ACTIVE || station.status === StationStatus.ALERT_MODE,
      status: station.status,
      reporting_interval_seconds: station.reporting_interval_seconds,
    };
  }

  async getStationConfig(request: GetStationConfigRequest): Promise<StationConfigResponse> {
    const station = await this.repository.findById(request.station_id);
    if (!station) {
      throw new Error(`Station with ID ${request.station_id} not found`);
    }

    return {
      station_id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      elevation: station.elevation,
      status: station.status,
      reporting_interval_seconds: station.reporting_interval_seconds,
    };
  }

  async updateReportingFrequency(
    request: UpdateReportingFrequencyRequest,
  ): Promise<UpdateReportingFrequencyResponse> {
    this.logger.log(
      `⚡ DYNAMIC FREQUENCY SHIFT for Station ${request.station_id}: Setting interval to ${request.frequency_seconds}s (Reason: ${request.reason})`
    );

    await this.repository.updateInterval(request.station_id, request.frequency_seconds);

    return {
      success: true,
      station_id: request.station_id,
      new_frequency_seconds: request.frequency_seconds,
      message: `Successfully updated sampling interval to ${request.frequency_seconds}s`,
    };
  }
}
