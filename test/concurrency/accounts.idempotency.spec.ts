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

describe('AccountsService - Idempotency', () => {
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

  it('should not create duplicates with same idempotency key', async () => {
    const accountId = 'test-idempotency';
    await service.createAccount(accountId, 1000);

    const idempotencyKey = 'test-key-12345';

    const results = await Promise.all(
      Array(10)
        .fill(null)
        .map(() =>
          service.updateBalance(accountId, {
            amount: 100,
            type: TransactionType.WITHDRAW,
            idempotencyKey,
          }),
        ),
    );

    expect(results.every((r) => r.success)).toBe(true);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(1);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(900);
  });

  it('should handle concurrent requests with same idempotency key', async () => {
    const accountId = 'test-concurrent-idempotency';
    await service.createAccount(accountId, 500);

    const idempotencyKey = 'concurrent-key-001';

    const promises = Array(50)
      .fill(null)
      .map(() =>
        service.updateBalance(accountId, {
          amount: 50,
          type: TransactionType.DEPOSIT,
          idempotencyKey,
        }),
      );

    const results = await Promise.all(promises);

    expect(results.every((r) => r.success)).toBe(true);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(1);

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(550);
  });
});
