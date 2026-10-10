import CircuitBreaker from 'opossum';
import { AppLogger } from '../logger/logger.service';

const BreakerConstructor: typeof CircuitBreaker =
  (CircuitBreaker as any)?.default || CircuitBreaker;

export interface CircuitBreakerConfig {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  name?: string;
}

export function createCircuitBreaker<TI extends any[], TR>(
  action: (...args: TI) => Promise<TR>,
  config: CircuitBreakerConfig = {},
  fallbackAction?: (...args: TI) => Promise<TR>,
  logger?: AppLogger,
): CircuitBreaker<TI, TR> {
  const breaker = new BreakerConstructor(action, {
    timeout: config.timeout ?? 3000,
    errorThresholdPercentage: config.errorThresholdPercentage ?? 50,
    resetTimeout: config.resetTimeout ?? 5000,
    name: config.name ?? 'DefaultCircuitBreaker',
  });

  if (fallbackAction) {
    breaker.fallback(fallbackAction);
  }

  if (logger) {
    const name = config.name ?? 'CircuitBreaker';
    breaker.on('open', () => logger.warn(`[${name}] State changed to OPEN (Fast-failing incoming calls)`, name));
    breaker.on('halfOpen', () => logger.log(`[${name}] State changed to HALF_OPEN (Probing dependency)`, name));
    breaker.on('close', () => logger.log(`[${name}] State changed to CLOSED (Healthy)`, name));
    breaker.on('fallback', (result) => logger.warn(`[${name}] Executed fallback handler`, name));
  }

  return breaker;
}
