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
import { AccountNotFoundException } from 'src/account/exceptions/account-not-found.exception';
import { TransactionExecutor } from 'src/account/services/transaction-executor.service';
import { RetryStrategy } from 'src/account/services/retry-strategy.service';
import { DataSource } from 'typeorm';

describe('AccountsService - Error Handling', () => {
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

  it('should throw InsufficientFundsException when balance is too low', async () => {
    const accountId = 'test-insufficient';
    await service.createAccount(accountId, 50);

    await expect(
      service.updateBalance(accountId, {
        amount: 100,
        type: TransactionType.WITHDRAW,
      }),
    ).rejects.toThrow(InsufficientFundsException);
  });

  it('should throw AccountNotFoundException for non-existent account', async () => {
    await expect(
      service.updateBalance('non-existent-account', {
        amount: 10,
        type: TransactionType.DEPOSIT,
      }),
    ).rejects.toThrow(AccountNotFoundException);
  });

  it('should handle zero balance edge case', async () => {
    const accountId = 'test-zero-balance';
    await service.createAccount(accountId, 0);

    const depositResult = await service.updateBalance(accountId, {
      amount: 100,
      type: TransactionType.DEPOSIT,
    });
    expect(depositResult.success).toBe(true);
    expect(depositResult.balanceAfter).toBe(100);

    await service.updateBalance(accountId, {
      amount: 100,
      type: TransactionType.WITHDRAW,
    });

    await expect(
      service.updateBalance(accountId, {
        amount: 1,
        type: TransactionType.WITHDRAW,
      }),
    ).rejects.toThrow(InsufficientFundsException);
  });
});
