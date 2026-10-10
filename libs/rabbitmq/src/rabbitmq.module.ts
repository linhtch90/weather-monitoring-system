import { Module, Global } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { AppLogger } from '@libs/common';

@Global()
@Module({
  providers: [AppLogger, RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
