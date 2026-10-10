import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLogger } from '../logger/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('RPC/HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const type = context.getType();
    let handlerInfo = '';

    if (type === 'rpc') {
      const rpcContext = context.switchToRpc();
      const handler = context.getHandler().name;
      handlerInfo = `gRPC ${handler}`;
    } else if (type === 'http') {
      const req = context.switchToHttp().getRequest();
      handlerInfo = `HTTP ${req.method} ${req.url}`;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(`${handlerInfo} completed in ${duration}ms`, 'LoggingInterceptor');
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.error(`${handlerInfo} failed in ${duration}ms: ${err.message}`, err.stack, 'LoggingInterceptor');
        },
      }),
    );
  }
}
