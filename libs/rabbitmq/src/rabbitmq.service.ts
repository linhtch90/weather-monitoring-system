import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { RABBITMQ_CONSTANTS } from './rabbitmq.constants';
import { AppLogger } from '@libs/common';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnApplicationShutdown {
  private connection?: amqp.ChannelModel;
  private publishChannel?: amqp.ConfirmChannel;
  private isConnecting = false;
  private isClosing = false;
  private url: string;

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('RabbitMQService');
    this.url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async connectWithRetry(retries = 10, delay = 2000): Promise<void> {
    if (this.isConnecting || this.connection) return;
    this.isConnecting = true;

    for (let i = 1; i <= retries; i++) {
      try {
        this.logger.log(`Connecting to RabbitMQ at ${this.url} (Attempt ${i}/${retries})...`);
        const conn = await amqp.connect(this.url);
        this.connection = conn;
        
        conn.on('error', (err) => {
          this.logger.error(`RabbitMQ connection error: ${err.message}`, err.stack);
        });

        conn.on('close', async () => {
          if (!this.isClosing) {
            this.logger.warn('RabbitMQ connection closed unexpectedly. Reconnecting...');
            this.connection = undefined;
            this.publishChannel = undefined;
            await this.connectWithRetry();
          }
        });

        // Initialize Confirm Channel for high-reliability publishing
        this.publishChannel = await conn.createConfirmChannel();
        await this.initTopology();
        this.logger.log('✅ Connected to RabbitMQ and initialized messaging topologies.');
        this.isConnecting = false;
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to connect to RabbitMQ: ${err.message}. Retrying in ${delay}ms...`);
        if (i === retries) {
          this.isConnecting = false;
          throw err;
        }
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  private async initTopology() {
    if (!this.publishChannel) return;

    // 1. Declare Dead Letter Exchange & Queue
    await this.publishChannel.assertExchange(
      RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_DLX,
      'direct',
      { durable: true }
    );
    await this.publishChannel.assertQueue(
      RABBITMQ_CONSTANTS.QUEUES.TELEMETRY_DLQ,
      { durable: true }
    );
    await this.publishChannel.bindQueue(
      RABBITMQ_CONSTANTS.QUEUES.TELEMETRY_DLQ,
      RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_DLX,
      'telemetry.poison'
    );

    // 2. Declare Raw Telemetry Topic Exchange
    await this.publishChannel.assertExchange(
      RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_TOPIC,
      'topic',
      { durable: true }
    );

    // 3. Declare Main Raw Telemetry Queue with DLX
    await this.publishChannel.assertQueue(
      RABBITMQ_CONSTANTS.QUEUES.RAW_TELEMETRY,
      {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_DLX,
          'x-dead-letter-routing-key': 'telemetry.poison',
        },
      }
    );
    await this.publishChannel.bindQueue(
      RABBITMQ_CONSTANTS.QUEUES.RAW_TELEMETRY,
      RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_TOPIC,
      RABBITMQ_CONSTANTS.ROUTING_KEYS.TELEMETRY_RAW_PATTERN
    );

    // 4. Declare Anomaly Events Queue
    await this.publishChannel.assertQueue(
      RABBITMQ_CONSTANTS.QUEUES.ANOMALY_EVENTS,
      { durable: true }
    );
    await this.publishChannel.bindQueue(
      RABBITMQ_CONSTANTS.QUEUES.ANOMALY_EVENTS,
      RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_TOPIC,
      RABBITMQ_CONSTANTS.ROUTING_KEYS.ANOMALY_DETECTED
    );
  }

  async publishTelemetry(routingKey: string, payload: any): Promise<boolean> {
    if (!this.publishChannel) {
      throw new Error('RabbitMQ confirm channel is not initialized');
    }

    const content = Buffer.from(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.publishChannel!.publish(
        RABBITMQ_CONSTANTS.EXCHANGES.TELEMETRY_TOPIC,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
        },
        (err) => {
          if (err) {
            this.logger.error(`Publisher confirmation rejected: ${err.message}`);
            return reject(err);
          }
          resolve(true);
        }
      );
    });
  }

  async createConsumerChannel(prefetch = RABBITMQ_CONSTANTS.PREFETCH.DEFAULT): Promise<amqp.Channel> {
    if (!this.connection) {
      throw new Error('RabbitMQ connection is not established');
    }
    const channel = await this.connection.createChannel();
    await channel.prefetch(prefetch);
    return channel;
  }

  async onApplicationShutdown() {
    this.isClosing = true;
    try {
      if (this.publishChannel) {
        await this.publishChannel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connection and channels cleanly closed.');
    } catch (err: any) {
      this.logger.error(`Error closing RabbitMQ: ${err.message}`);
    }
  }
}
