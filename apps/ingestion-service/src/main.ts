import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { IngestionModule } from './ingestion.module';
import {
  TELEMETRY_PACKAGE_NAME,
  TELEMETRY_PROTO_PATH,
} from '@libs/contracts';
import { AppLogger } from '@libs/common';

async function bootstrap() {
  const logger = new AppLogger();
  logger.setContext('IngestionBootstrap');

  const httpPort = parseInt(process.env.INGESTION_HTTP_PORT || '3000', 10);
  const grpcPort = process.env.INGESTION_GRPC_PORT || '50052';
  const grpcUrl = `0.0.0.0:${grpcPort}`;

  // Create primary HTTP Express app
  const app = await NestFactory.create(IngestionModule, {
    logger: new AppLogger(),
  });

  // Attach gRPC microservice listener (Hybrid application)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: TELEMETRY_PACKAGE_NAME,
      protoPath: TELEMETRY_PROTO_PATH,
      url: grpcUrl,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });

  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(httpPort);

  logger.log(`🚀 Ingestion Gateway HTTP listening on http://localhost:${httpPort}`);
  logger.log(`🚀 Ingestion Gateway gRPC listening on ${grpcUrl}`);
}

bootstrap();
