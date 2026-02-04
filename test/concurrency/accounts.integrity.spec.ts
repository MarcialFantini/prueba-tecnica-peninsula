import { TestingModule, Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AccountsService } from 'src/account/account.service';
import { Account } from 'src/account/entities/account.entity';
import {
  Transaction,
  TransactionType,
} from 'src/account/entities/transaction.entity';
import { TransactionExecutor } from 'src/account/services/transaction-executor.service';
import { RetryStrategy } from 'src/account/services/retry-strategy.service';
import { IdempotencyService } from 'src/account/services/idempotency.service';
import { DataSource } from 'typeorm';

describe('AccountsService - Data Integrity', () => {
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
      providers: [
        AccountsService,
        TransactionExecutor,
        RetryStrategy,
        IdempotencyService,
      ],
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

  it('should increment version on each successful update', async () => {
    const accountId = 'test-version';
    const account = await service.createAccount(accountId, 100);
    expect(account.version).toBe(1);

    await service.updateBalance(accountId, {
      amount: 10,
      type: TransactionType.DEPOSIT,
    });

    await service.updateBalance(accountId, {
      amount: 5,
      type: TransactionType.WITHDRAW,
    });

    const updatedAccount = await dataSource
      .getRepository(Account)
      .findOne({ where: { accountId } });

    expect(updatedAccount?.version).toBe(3);
  });

  it('should track version in transaction records', async () => {
    const accountId = 'test-version-tracking';
    await service.createAccount(accountId, 100);

    await service.updateBalance(accountId, {
      amount: 10,
      type: TransactionType.DEPOSIT,
    });

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions[0].version).toBe(2);
  });

  it('should handle exact balance withdrawal', async () => {
    const accountId = 'test-exact-withdrawal';
    await service.createAccount(accountId, 100);

    const result = await service.updateBalance(accountId, {
      amount: 100,
      type: TransactionType.WITHDRAW,
    });

    expect(result.success).toBe(true);
    expect(result.balanceAfter).toBe(0);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(0);
  });

  it('should handle very small amounts (decimal precision)', async () => {
    const accountId = 'test-decimal-precision';
    await service.createAccount(accountId, 100.5);

    await service.updateBalance(accountId, {
      amount: 0.25,
      type: TransactionType.WITHDRAW,
    });

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(100.25);
  });
});
