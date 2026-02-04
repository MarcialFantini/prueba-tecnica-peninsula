// src/account/account.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Account } from './entities/account.entity';
import { Transaction } from './entities/transaction.entity';
import { AccountsController } from './account.controller';
import { AccountsService } from './account.service';
import { TransactionExecutor } from './services/transaction-executor.service';
import { RetryStrategy } from './services/retry-strategy.service';
import { IdempotencyService } from './services/idempotency.service';

/**
 * Módulo de cuentas bancarias - REFACTORIZADO
 *
 * Incluye todos los servicios necesarios para los tests.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Account, Transaction])],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    TransactionExecutor,
    RetryStrategy,
    IdempotencyService,
  ],
  exports: [AccountsService],
})
export class AccountsModule {}
