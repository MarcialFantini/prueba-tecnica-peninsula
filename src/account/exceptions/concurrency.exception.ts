// src/accounts/exceptions/concurrency.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Excepción lanzada cuando se exceden los reintentos máximos debido a
 * conflictos de concurrencia.
 *
 * HTTP Status: 503 SERVICE UNAVAILABLE
 *
 * Esta excepción indica:
 * - Contención extrema en la cuenta
 * - Sistema bajo carga muy alta
 * - El cliente PUEDE reintentar la operación (es transitorio)
 *
 * En la práctica, con MAX_RETRIES=500, esta excepción es extremadamente rara
 * y solo ocurriría bajo carga patológica o problemas de infraestructura.
 */
export class ConcurrencyException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message,
        error: 'ConcurrencyException',
        retryable: true, // Indica al cliente que puede reintentar
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
