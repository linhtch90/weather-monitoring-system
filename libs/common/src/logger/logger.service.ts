import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements NestLoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  private formatMessage(level: string, message: any, context?: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const ctx = context || this.context || 'App';
    const logObject = {
      timestamp,
      level,
      context: ctx,
      message: typeof message === 'object' ? JSON.stringify(message) : message,
      ...(meta ? { meta } : {}),
    };
    return JSON.stringify(logObject);
  }

  log(message: any, context?: string, meta?: any) {
    console.log(this.formatMessage('INFO', message, context, meta));
  }

  error(message: any, trace?: string, context?: string, meta?: any) {
    console.error(this.formatMessage('ERROR', message, context, { trace, ...meta }));
  }

  warn(message: any, context?: string, meta?: any) {
    console.warn(this.formatMessage('WARN', message, context, meta));
  }

  debug?(message: any, context?: string, meta?: any) {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage('DEBUG', message, context, meta));
    }
  }
}
