// src/account/account.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Account } from './entities/account.entity';
import { Transaction } from './entities/transaction.entity';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { UpdateBalanceResponseDto } from './dto/update-balance-response.dto';
import { AccountNotFoundException } from './exceptions/account-not-found.exception';
import { TransactionExecutor } from './services/transaction-executor.service';
import { v4 as uuidv4 } from 'uuid';
/**
 * Service for managing bank accounts.
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
  ) {}

  /**
   * Crea una nueva cuenta bancaria.
   */
  async createAccount(
    accountId?: string,
    initialBalance: number = 0,
  ): Promise<Account> {
    const newAccountId = accountId ?? uuidv4();

    this.logger.log(
      `Creating account ${newAccountId} with balance ${initialBalance}`,
    );

    const account = this.accountRepository.create({
      accountId: newAccountId,
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
   */
  async updateBalance(
    accountId: string,
    dto: UpdateBalanceDto,
  ): Promise<UpdateBalanceResponseDto> {
    this.logger.log(
      `Update balance request for account ${accountId}: ${dto.type} ${dto.amount}`,
    );

    return this.transactionExecutor.executeWithRetry(accountId, dto);
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
