import { NestFactory } from '@nestjs/core';
import { AlertingModule } from './alerting.module';
import { AppLogger } from '@libs/common';

async function bootstrap() {
  const logger = new AppLogger();
  logger.setContext('AlertingBootstrap');

  const app = await NestFactory.createApplicationContext(AlertingModule, {
    logger: new AppLogger(),
  });

  app.enableShutdownHooks();
  logger.log('🚀 Alerting & Dynamic Control Service started and listening for anomaly events.');
}

bootstrap();
