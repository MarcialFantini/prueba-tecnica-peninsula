// src/accounts/exceptions/insufficient-funds.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Excepción lanzada cuando se intenta realizar un retiro que resultaría
 * en saldo negativo.
 *
 * HTTP Status: 422 UNPROCESSABLE ENTITY
 *
 * Esta es una excepción NO RECUPERABLE:
 * - No debe reintentarse automáticamente
 * - Indica violación de regla de negocio
 * - El cliente debe ajustar el monto o depositar fondos primero
 */
export class InsufficientFundsException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message,
        error: 'InsufficientFunds',
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
