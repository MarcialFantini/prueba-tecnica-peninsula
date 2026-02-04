// src/account/services/retry-strategy.service.ts
import { Injectable } from '@nestjs/common';
import { AccountNotFoundException } from '../exeptions/account-not-found.exception';
import { InsufficientFundsException } from '../exeptions/insufficient-funds.exception';
import { ConcurrencyException } from '../exeptions/concurrency.exception';

export interface RetryConfig {
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterMs?: number;
}

export interface RetryCallbacks {
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  onMaxRetriesExceeded?: (maxRetries: number) => void;
}

/**
 * Servicio que implementa estrategia de retry con exponential backoff y jitter.
 */
@Injectable()
export class RetryStrategy {
  private readonly defaultConfig: Required<RetryConfig> = {
    maxRetries: 500,
    baseBackoffMs: 5,
    maxBackoffMs: 1000,
    jitterMs: 10,
  };

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    callbacks?: RetryCallbacks,
    config?: RetryConfig,
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < finalConfig.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Fail-fast: errores que NO deben reintentar
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Último intento alcanzado
        if (attempt === finalConfig.maxRetries - 1) {
          callbacks?.onMaxRetriesExceeded?.(finalConfig.maxRetries);
          throw new ConcurrencyException(
            `Failed after ${finalConfig.maxRetries} attempts`,
          );
        }

        // Calcular delay con exponential backoff + jitter
        const delay = this.calculateDelay(attempt, finalConfig);

        callbacks?.onRetry?.(attempt + 1, delay, error);

        // Esperar antes de reintentar
        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError || new Error('Unexpected error in retry logic');
  }

  private isNonRetryableError(error: any): boolean {
    return (
      error instanceof InsufficientFundsException ||
      error instanceof AccountNotFoundException
    );
  }

  private calculateDelay(
    attempt: number,
    config: Required<RetryConfig>,
  ): number {
    const exponentialBackoff = Math.pow(2, attempt) * config.baseBackoffMs;
    const cappedBackoff = Math.min(exponentialBackoff, config.maxBackoffMs);
    const jitter = Math.random() * config.jitterMs;

    return cappedBackoff + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
