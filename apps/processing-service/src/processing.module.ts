import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@libs/rabbitmq';
import { TimescaleRepository } from './storage/timescale.repository';
import { AnomalyDetector } from './anomaly/anomaly.detector';
import { ProcessingConsumer } from './processing.consumer';
import { AppLogger } from '@libs/common';

@Module({
  imports: [RabbitMQModule],
  providers: [
    TimescaleRepository,
    AnomalyDetector,
    ProcessingConsumer,
    AppLogger,
  ],
})
export class ProcessingModule {}
