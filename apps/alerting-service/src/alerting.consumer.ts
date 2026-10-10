import { Injectable, OnModuleInit, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import { firstValueFrom, Observable } from 'rxjs';
import { RabbitMQService, RABBITMQ_CONSTANTS } from '@libs/rabbitmq';
import {
  AnomalyEventPayload,
  UpdateReportingFrequencyRequest,
  UpdateReportingFrequencyResponse,
} from '@libs/contracts';
import { AppLogger } from '@libs/common';

interface StationGrpcService {
  updateReportingFrequency(
    req: UpdateReportingFrequencyRequest,
  ): Observable<UpdateReportingFrequencyResponse>;
}

@Injectable()
export class AlertingConsumer implements OnModuleInit, OnApplicationShutdown {
  private channel?: amqp.Channel;
  private stationGrpc!: StationGrpcService;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    @Inject('STATION_GRPC_PACKAGE') private readonly grpcClient: ClientGrpc,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('AlertingConsumer');
  }

  async onModuleInit() {
    this.stationGrpc = this.grpcClient.getService<StationGrpcService>('StationService');
    await this.startConsumer();
  }

  private async startConsumer() {
    try {
      this.channel = await this.rabbitmqService.createConsumerChannel(50);
      this.logger.log(`Subscribed to queue ${RABBITMQ_CONSTANTS.QUEUES.ANOMALY_EVENTS}`);

      await this.channel.consume(
        RABBITMQ_CONSTANTS.QUEUES.ANOMALY_EVENTS,
        async (msg) => {
          if (msg) {
            await this.handleAnomaly(msg);
          }
        },
        { noAck: false }
      );
    } catch (err: any) {
      this.logger.warn(`Alerting consumer connection delayed (${err.message}). Retrying in 3s...`);
      setTimeout(() => this.startConsumer(), 3000);
    }
  }

  private async handleAnomaly(msg: amqp.ConsumeMessage) {
    try {
      const anomaly: AnomalyEventPayload = JSON.parse(msg.content.toString());
      this.logger.warn(
        `🚨 CRITICAL ALERT TRIGGERED: Station ${anomaly.station_id} reported ${anomaly.metric} anomaly: ${anomaly.description}`
      );

      // Automated Dynamic Frequency Adjustment Loop:
      // Command the station to accelerate monitoring interval to 1 second
      const updateReq: UpdateReportingFrequencyRequest = {
        station_id: anomaly.station_id,
        frequency_seconds: 1, // High-frequency 1s mode
        reason: `Automated alert trigger: ${anomaly.description}`,
      };

      this.logger.log(`Dispatching direct gRPC UpdateReportingFrequency to Station Service...`);
      const res = await firstValueFrom(this.stationGrpc.updateReportingFrequency(updateReq));
      this.logger.log(`✅ Station ${res.station_id} dynamically shifted to ${res.new_frequency_seconds}s interval: ${res.message}`);

      this.channel?.ack(msg);
    } catch (err: any) {
      this.logger.error(`Error processing anomaly event: ${err.message}`, err.stack);
      this.channel?.nack(msg, false, false);
    }
  }

  async onApplicationShutdown() {
    if (this.channel) {
      await this.channel.close();
    }
  }
}
