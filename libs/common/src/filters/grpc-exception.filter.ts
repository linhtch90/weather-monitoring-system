import { Catch, RpcExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

@Catch()
export class GrpcServerExceptionFilter implements RpcExceptionFilter<any> {
  catch(exception: any, host: ArgumentsHost): Observable<any> {
    const rpcHost = host.switchToRpc();
    
    let grpcCode = status.INTERNAL;
    let message = exception.message || 'Internal server error';

    if (exception instanceof RpcException) {
      return throwError(() => exception.getError());
    }

    if (exception.status === 404 || exception.name === 'NotFoundException') {
      grpcCode = status.NOT_FOUND;
    } else if (exception.status === 400 || exception.name === 'BadRequestException') {
      grpcCode = status.INVALID_ARGUMENT;
    } else if (exception.status === 503) {
      grpcCode = status.UNAVAILABLE;
    }

    return throwError(() => ({
      code: grpcCode,
      message,
    }));
  }
}
