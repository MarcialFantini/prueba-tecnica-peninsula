// src/accounts/exceptions/account-not-found.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Excepción lanzada cuando se intenta operar sobre una cuenta inexistente.
 *
 * HTTP Status: 404 NOT FOUND
 *
 * Esta es una excepción NO RECUPERABLE:
 * - No debe reintentarse automáticamente
 * - El cliente debe corregir el accountId
 */
export class AccountNotFoundException extends HttpException {
  constructor(accountId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: `Account with ID '${accountId}' not found`,
        error: 'AccountNotFound',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
