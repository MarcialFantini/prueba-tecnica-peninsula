// src/account/services/transaction-executor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Account } from '../entities/account.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { UpdateBalanceDto } from '../dto/update-balance.dto';
import { UpdateBalanceResponseDto } from '../dto/update-balance-response.dto';
import { AccountNotFoundException } from '../exeptions/account-not-found.exception';
import { InsufficientFundsException } from '../exeptions/insufficient-funds.exception';
import { RetryStrategy } from './retry-strategy.service';

/**
 * Servicio responsable de ejecutar transacciones bancarias.
 *
 * Implementa optimistic locking con retry automático.
 */
@Injectable()
export class TransactionExecutor {
  private readonly logger = new Logger(TransactionExecutor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly retryStrategy: RetryStrategy,
  ) {}

  /**
   * Ejecuta una actualización de balance con retry automático.
   */
  async executeWithRetry(
    accountId: string,
    dto: UpdateBalanceDto,
    idempotencyKey: string,
  ): Promise<UpdateBalanceResponseDto> {
    const normalizedAmount = this.normalizeAmount(dto.amount, dto.type);
    let attempt = 0;

    return this.retryStrategy.executeWithRetry(
      async () => {
        const currentAttempt = attempt++;
        return this.executeTransaction(
          accountId,
          normalizedAmount,
          dto.type,
          idempotencyKey,
          currentAttempt,
        );
      },
      {
        onRetry: (attemptNum, delay, error) => {
          this.logger.warn(
            `Retry attempt ${attemptNum} for account ${accountId} after ${delay}ms. Error: ${error.message}`,
          );
        },
        onMaxRetriesExceeded: (maxRetries) => {
          this.logger.error(
            `Max retries (${maxRetries}) exceeded for account ${accountId}`,
          );
        },
      },
    );
  }

  /**
   * Normaliza el monto según el tipo de transacción.
   */
  private normalizeAmount(amount: number, type: TransactionType): number {
    return type === TransactionType.WITHDRAW
      ? -Math.abs(amount)
      : Math.abs(amount);
  }

  /**
   * Ejecuta una transacción bancaria individual con optimistic locking.
   */
  private async executeTransaction(
    accountId: string,
    amount: number,
    type: TransactionType,
    idempotencyKey: string,
    attemptNumber: number,
  ): Promise<UpdateBalanceResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Verificar idempotencia
      const existingTx = await manager.findOne(Transaction, {
        where: { idempotencyKey },
      });

      if (existingTx) {
        return this.buildResponseFromTransaction(existingTx, attemptNumber);
      }

      // 2. Obtener versión y balance actual (sin locks)
      const account = await manager.findOne(Account, {
        where: { accountId },
        select: ['version', 'balance'],
      });

      if (!account) {
        throw new AccountNotFoundException(accountId);
      }

      const currentVersion = account.version;
      const balanceBefore = Number(account.balance);

      // 3. Ejecutar UPDATE Atómico + Bloqueo Optimista
      const updateResult = await manager
        .createQueryBuilder()
        .update(Account)
        .set({
          balance: () => `balance + ${amount}`,
          version: () => 'version + 1',
          updatedAt: new Date(),
        })
        .where('account_id = :accountId', { accountId })
        .andWhere('version = :currentVersion', { currentVersion })
        .andWhere('balance + :amount >= 0', { amount })
        .execute();

      // 4. Si falló, lanzar error para reintentar o abortar
      if (updateResult.affected === 0) {
        if (balanceBefore + amount < 0) {
          throw new InsufficientFundsException('Insufficient funds');
        }
        throw new Error('Version conflict - retry required');
      }

      // 5. Registrar transacción
      const transaction = manager.create(Transaction, {
        accountId,
        amount,
        type,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        version: currentVersion + 1,
        idempotencyKey,
      });

      const savedTx = await manager.save(Transaction, transaction);

      return this.buildResponseFromTransaction(savedTx, attemptNumber);
    });
  }

  /**
   * Construye la respuesta a partir de una transacción guardada.
   */
  private buildResponseFromTransaction(
    transaction: Transaction,
    attemptNumber: number,
  ): UpdateBalanceResponseDto {
    return {
      success: true,
      transactionId: transaction.id,
      balanceAfter: Number(transaction.balanceAfter),
      version: transaction.version,
      wasRetried: attemptNumber > 0,
    };
  }
}
