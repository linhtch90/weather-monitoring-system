import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { StationModule } from './station.module';
import { STATION_PACKAGE_NAME, STATION_PROTO_PATH } from '@libs/contracts';
import { AppLogger } from '@libs/common';

async function bootstrap() {
  const logger = new AppLogger();
  logger.setContext('StationServiceBootstrap');

  const grpcPort = process.env.STATION_GRPC_PORT || '50051';
  const grpcUrl = `0.0.0.0:${grpcPort}`;

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(StationModule, {
    transport: Transport.GRPC,
    options: {
      package: STATION_PACKAGE_NAME,
      protoPath: STATION_PROTO_PATH,
      url: grpcUrl,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
    logger: new AppLogger(),
  });

  app.enableShutdownHooks();
  await app.listen();
  logger.log(`🚀 Station Management gRPC Service listening on ${grpcUrl}`);
}

bootstrap();
