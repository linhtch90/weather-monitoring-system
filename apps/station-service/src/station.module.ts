import { Module } from '@nestjs/common';
import { StationController } from './station.controller';
import { StationService } from './station.service';
import { StationRepository } from './station.repository';
import { AppLogger } from '@libs/common';

@Module({
  controllers: [StationController],
  providers: [StationService, StationRepository, AppLogger],
  exports: [StationService],
})
export class StationModule {}
