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
      // PASO 1: Verificar idempotencia dentro de la transacción
      const existingTx = await manager.findOne(Transaction, {
        where: { idempotencyKey },
      });

      if (existingTx) {
        this.logger.log(
          `Idempotent request detected within transaction: ${idempotencyKey}`,
        );
        return this.buildResponseFromTransaction(existingTx, attemptNumber);
      }

      // PASO 2: Leer cuenta SIN LOCKS (optimistic locking)
      const account = await manager.findOne(Account, {
        where: { accountId },
      });

      if (!account) {
        throw new AccountNotFoundException(accountId);
      }

      // PASO 3: Calcular nuevo balance y validar reglas de negocio
      const balanceBefore = Number(account.balance);
      const newBalance = balanceBefore + amount;

      if (newBalance < 0) {
        throw new InsufficientFundsException(
          `Insufficient funds. Current: ${balanceBefore}, Required: ${Math.abs(amount)}`,
        );
      }

      // PASO 4: Actualizar balance con optimistic locking
      const currentVersion = account.version;
      const updateResult = await manager
        .createQueryBuilder()
        .update(Account)
        .set({
          balance: newBalance,
          version: () => 'version + 1',
        })
        .where('account_id = :accountId', { accountId })
        .andWhere('version = :currentVersion', { currentVersion })
        .execute();

      // PASO 5: Detectar conflicto de versión
      if (updateResult.affected === 0) {
        this.logger.warn(
          `Optimistic lock conflict for account ${accountId} at version ${currentVersion}`,
        );
        throw new Error('Version conflict - retry required');
      }

      // PASO 6: Crear registro de transacción
      const transaction = manager.create(Transaction, {
        accountId,
        amount,
        type,
        balanceBefore,
        balanceAfter: newBalance,
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
