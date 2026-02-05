import { TestingModule, Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AccountsService } from 'src/account/account.service';
import { Account } from 'src/account/entities/account.entity';
import {
  Transaction,
  TransactionType,
} from 'src/account/entities/transaction.entity';
import { InsufficientFundsException } from 'src/account/exceptions/insufficient-funds.exception';
import { ConcurrencyException } from 'src/account/exceptions/concurrency.exception';
import { TransactionExecutor } from 'src/account/services/transaction-executor.service';
import { RetryStrategy } from 'src/account/services/retry-strategy.service';
import { DataSource } from 'typeorm';

describe('AccountsService - Concurrency & Stress', () => {
  let service: AccountsService;
  let dataSource: DataSource;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_TEST_HOST || 'localhost',
          port: parseInt(process.env.DB_TEST_PORT || '5433'),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres123',
          database: process.env.DB_TEST_NAME || 'peninsula_test',
          entities: [Account, Transaction],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([Account, Transaction]),
      ],
      providers: [AccountsService, TransactionExecutor, RetryStrategy],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await module.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE accounts, transactions CASCADE');
  });

  it('should handle 100 concurrent withdrawals of $5 with initial balance of $500', async () => {
    const accountId = 'test-concurrent-100';
    await service.createAccount(accountId, 500);

    const withdrawAmount = 5;
    const numWithdraws = 100;

    const promises = Array(numWithdraws)
      .fill(null)
      .map(() =>
        service
          .updateBalance(accountId, {
            amount: withdrawAmount,
            type: TransactionType.WITHDRAW,
          })
          .catch((err) => ({ error: err })),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r)).length;
    const failures = results.filter(
      (r) => 'error' in r && r.error instanceof InsufficientFundsException,
    ).length;

    expect(successes).toBe(100);
    expect(failures).toBe(0);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(0);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(100);
  }, 60000);

  it('should handle high contention with many small operations', async () => {
    const accountId = 'test-high-contention';
    await service.createAccount(accountId, 1000);

    const promises = Array(200)
      .fill(null)
      .map(() =>
        service
          .updateBalance(accountId, {
            amount: 1,
            type: TransactionType.WITHDRAW,
          })
          .catch((err) => ({ error: err })),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r)).length;

    expect(
      results.filter(
        (r) => 'error' in r && r.error instanceof ConcurrencyException,
      ).length,
    ).toBe(0);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(1000 - successes);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(successes);
  }, 60000);

  it('should prevent overdraft with concurrent withdrawals', async () => {
    const accountId = 'test-overdraft-prevention';
    await service.createAccount(accountId, 100);

    const promises = Array(10)
      .fill(null)
      .map(() =>
        service
          .updateBalance(accountId, {
            amount: 20,
            type: TransactionType.WITHDRAW,
          })
          .catch((err) => ({ error: err })),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r)).length;
    const insufficientFunds = results.filter(
      (r) => 'error' in r && r.error instanceof InsufficientFundsException,
    ).length;

    expect(successes).toBeGreaterThan(0);
    expect(successes).toBeLessThanOrEqual(5);
    expect(successes + insufficientFunds).toBe(10);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(100 - successes * 20);
  });

  it('should handle large concurrent load (300 operations)', async () => {
    const accountId = 'test-large-load';
    await service.createAccount(accountId, 5000);

    const promises = Array(300)
      .fill(null)
      .map(() =>
        service
          .updateBalance(accountId, {
            amount: 10,
            type: TransactionType.WITHDRAW,
          })
          .catch((err) => ({ error: err })),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r)).length;

    expect(
      results.filter(
        (r) => 'error' in r && r.error instanceof ConcurrencyException,
      ).length,
    ).toBe(0);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(5000 - successes * 10);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(successes);
  }, 60000);
});
