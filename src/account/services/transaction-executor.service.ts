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
 * Service responsible for executing bank transactions.
 * Implements optimistic locking with automatic retries.
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
    attemptNumber: number,
  ): Promise<UpdateBalanceResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Get current version for Optimistic Lock
      const currentAccount = await manager.findOne(Account, {
        where: { accountId },
        select: ['version', 'balance'],
      });
      if (!currentAccount) throw new AccountNotFoundException(accountId);

      const currentVersion = currentAccount.version;
      const balanceBefore = Number(currentAccount.balance);

      // 2. Atomic CTE execution
      // Performs validation, updates account and inserts transaction in a single round-trip
      const sql = `
        WITH updated_account AS (
          UPDATE accounts
          SET 
            balance = balance + $1,
            version = version + 1,
            updated_at = NOW()
          WHERE 
            account_id = $2 
            AND version = $3 
            AND (balance + $1) >= 0
          RETURNING balance, version
        )
        INSERT INTO transactions (
          account_id, amount, type, balance_before, balance_after, version, created_at
        )
        SELECT 
          $2, $1, $4, $5, balance, version, NOW()
        FROM updated_account
        RETURNING id, balance_after, version;
      `;

      const result = await manager.query(sql, [
        amount,
        accountId,
        currentVersion,
        type,
        balanceBefore,
      ]);

      // 3. Analizar resultado
      if (result.length === 0) {
        // Si falló, investigamos por qué
        if (balanceBefore + amount < 0) {
          throw new InsufficientFundsException('Insufficient funds');
        }
        // Version conflict detected
        throw new Error('Version conflict - retry required');
      }

      // 4. Construir respuesta exitosa
      return {
        success: true,
        transactionId: result[0].id,
        balanceAfter: Number(result[0].balance_after),
        version: result[0].version,
        wasRetried: attemptNumber > 0,
      };
    });
  }
}
