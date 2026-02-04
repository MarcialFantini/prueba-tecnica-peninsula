// src/account/account.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from './entities/account.entity';
import { Transaction } from './entities/transaction.entity';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { UpdateBalanceResponseDto } from './dto/update-balance-response.dto';
import { AccountNotFoundException } from './exeptions/account-not-found.exception';
import { TransactionExecutor } from './services/transaction-executor.service';
import { IdempotencyService } from './services/idempotency.service';

/**
 * Servicio principal de cuentas bancarias - REFACTORIZADO
 *
 * Cambios principales vs versión original:
 * 1. Separación de responsabilidades en servicios especializados
 * 2. Mejor organización y mantenibilidad
 * 3. Misma funcionalidad, mejor arquitectura
 *
 * COMPATIBLE con todos los tests existentes - no requiere cambios en los tests.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly transactionExecutor: TransactionExecutor,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Crea una nueva cuenta bancaria.
   */
  async createAccount(
    accountId: string,
    initialBalance: number = 0,
  ): Promise<Account> {
    this.logger.log(
      `Creating account ${accountId} with balance ${initialBalance}`,
    );

    const account = this.accountRepository.create({
      accountId,
      balance: initialBalance,
    });

    return this.accountRepository.save(account);
  }
  /**
   * Obtiene todas las cuentas bancarias.
  
  */
  async getAccounts(): Promise<Account[]> {
    return this.accountRepository.find();
  }

  /**
   * Obtiene el balance actual de una cuenta.
   */
  async getBalance(accountId: string): Promise<number> {
    const account = await this.accountRepository.findOne({
      where: { accountId },
    });

    if (!account) {
      throw new AccountNotFoundException(accountId);
    }

    return Number(account.balance);
  }

  /**
   * Actualiza el balance de una cuenta (depósito o retiro).
   *
   * Esta implementación refactorizada:
   * - Mantiene la misma API pública (compatible con tests existentes)
   * - Delega lógica compleja a servicios especializados
   * - Mejora la mantenibilidad sin cambiar el comportamiento
   */
  async updateBalance(
    accountId: string,
    dto: UpdateBalanceDto,
  ): Promise<UpdateBalanceResponseDto> {
    this.logger.log(
      `Update balance request for account ${accountId}: ${dto.type} ${dto.amount}`,
    );

    // Generar idempotency key si no se proporciona
    const idempotencyKey = this.idempotencyService.ensureKey(
      dto.idempotencyKey,
    );

    // Verificar si ya existe una transacción con esta idempotency key
    const cachedResult =
      await this.idempotencyService.getCachedResult(idempotencyKey);
    if (cachedResult) {
      this.logger.log(
        `Returning cached result for idempotency key: ${idempotencyKey}`,
      );
      return cachedResult;
    }

    // Ejecutar la transacción con retry automático
    return this.transactionExecutor.executeWithRetry(
      accountId,
      dto,
      idempotencyKey,
    );
  }

  /**
   * Obtiene el historial de transacciones de una cuenta.
   */
  async getTransactionHistory(accountId: string): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }
}
