import { NestFactory } from '@nestjs/core';
import { ProcessingModule } from './processing.module';
import { AppLogger } from '@libs/common';

async function bootstrap() {
  const logger = new AppLogger();
  logger.setContext('ProcessingBootstrap');

  const app = await NestFactory.createApplicationContext(ProcessingModule, {
    logger: new AppLogger(),
  });

  app.enableShutdownHooks();
  logger.log('🚀 Processing & Analytics Worker Service started and consuming from RabbitMQ.');
}

bootstrap();
