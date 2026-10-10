import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RabbitMQService, RABBITMQ_CONSTANTS } from '@libs/rabbitmq';
import { TimescaleRepository } from './storage/timescale.repository';
import { AnomalyDetector } from './anomaly/anomaly.detector';
import { TelemetryPayload } from '@libs/contracts';
import { AppLogger } from '@libs/common';

interface BufferedItem {
  msg: amqp.ConsumeMessage;
  payload: TelemetryPayload;
}

@Injectable()
export class ProcessingConsumer implements OnModuleInit, OnApplicationShutdown {
  private channel?: amqp.Channel;
  private buffer: BufferedItem[] = [];
  private flushTimer?: NodeJS.Timeout;
  private readonly BATCH_SIZE = 500;
  private readonly FLUSH_INTERVAL_MS = 250;
  private isProcessing = false;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    private readonly timescaleRepo: TimescaleRepository,
    private readonly anomalyDetector: AnomalyDetector,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('ProcessingConsumer');
  }

  async onModuleInit() {
    await this.startConsumer();
  }

  private async startConsumer() {
    try {
      this.channel = await this.rabbitmqService.createConsumerChannel(RABBITMQ_CONSTANTS.PREFETCH.DEFAULT);
      
      this.logger.log(
        `Subscribed to queue ${RABBITMQ_CONSTANTS.QUEUES.RAW_TELEMETRY} with prefetch ${RABBITMQ_CONSTANTS.PREFETCH.DEFAULT}`
      );

      this.scheduleTimer();

      await this.channel.consume(
        RABBITMQ_CONSTANTS.QUEUES.RAW_TELEMETRY,
        (msg) => {
          if (msg) {
            this.handleMessage(msg);
          }
        },
        { noAck: false }
      );
    } catch (err: any) {
      this.logger.warn(`Consumer startup delayed (${err.message}). Retrying in 3s...`);
      setTimeout(() => this.startConsumer(), 3000);
    }
  }

  private handleMessage(msg: amqp.ConsumeMessage) {
    try {
      const payload: TelemetryPayload = JSON.parse(msg.content.toString());
      
      // Anomaly Detection Check
      const anomaly = this.anomalyDetector.evaluate(payload);
      if (anomaly) {
        this.rabbitmqService.publishTelemetry(
          RABBITMQ_CONSTANTS.ROUTING_KEYS.ANOMALY_DETECTED,
          anomaly
        ).catch((err) => this.logger.error(`Failed to publish anomaly event: ${err.message}`));
      }

      this.buffer.push({ msg, payload });

      if (this.buffer.length >= this.BATCH_SIZE) {
        this.flushBuffer();
      }
    } catch (err: any) {
      this.logger.error(`Failed to parse telemetry message: ${err.message}`);
      // Reject and send to Dead Letter Queue (no requeue)
      this.channel?.nack(msg, false, false);
    }
  }

  private scheduleTimer() {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flushBuffer();
      }
    }, this.FLUSH_INTERVAL_MS);
  }

  private async flushBuffer() {
    if (this.isProcessing || this.buffer.length === 0) return;
    this.isProcessing = true;

    const currentBatch = [...this.buffer];
    this.buffer = [];

    const payloads = currentBatch.map((item) => item.payload);

    try {
      const startTime = Date.now();
      await this.timescaleRepo.insertBatch(payloads);
      const duration = Date.now() - startTime;

      this.logger.log(`💾 Committed micro-batch of ${payloads.length} records in ${duration}ms`);

      // Acknowledge all processed messages
      if (this.channel) {
        for (const item of currentBatch) {
          this.channel.ack(item.msg);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to commit batch to TimescaleDB: ${err.message}. Requeuing...`);
      if (this.channel) {
        for (const item of currentBatch) {
          this.channel.nack(item.msg, false, true);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async onApplicationShutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.buffer.length > 0) {
      await this.flushBuffer();
    }
    if (this.channel) {
      await this.channel.close();
    }
  }
}
