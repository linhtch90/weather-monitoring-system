import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AlertingConsumer } from './alerting.consumer';
import { RabbitMQModule } from '@libs/rabbitmq';
import { AppLogger } from '@libs/common';
import {
  STATION_PACKAGE_NAME,
  STATION_PROTO_PATH,
} from '@libs/contracts';

@Module({
  imports: [
    RabbitMQModule,
    ClientsModule.register([
      {
        name: 'STATION_GRPC_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: STATION_PACKAGE_NAME,
          protoPath: STATION_PROTO_PATH,
          url: process.env.STATION_GRPC_URL || 'localhost:50051',
          loader: {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
          },
        },
      },
    ]),
  ],
  providers: [AlertingConsumer, AppLogger],
})
export class AlertingModule {}
