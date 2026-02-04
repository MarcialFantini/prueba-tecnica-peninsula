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

describe('AccountsService - Mixed Operations', () => {
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

  it('should handle concurrent mixed operations correctly', async () => {
    const accountId = 'test-mixed-ops';
    await service.createAccount(accountId, 1000);

    const operations = [
      ...Array(50).fill({ amount: 10, type: TransactionType.DEPOSIT }),
      ...Array(50).fill({ amount: 15, type: TransactionType.WITHDRAW }),
    ];

    const results = await Promise.all(
      operations.map((op) =>
        service.updateBalance(accountId, op).catch((err) => ({ error: err })),
      ),
    );

    const successfulDeposits = results.filter(
      (r, idx) =>
        !('error' in r) && operations[idx].type === TransactionType.DEPOSIT,
    ).length;

    const successfulWithdraws = results.filter(
      (r, idx) =>
        !('error' in r) && operations[idx].type === TransactionType.WITHDRAW,
    ).length;

    const expectedBalance =
      1000 + successfulDeposits * 10 - successfulWithdraws * 15;

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(expectedBalance);

    const transactions = await service.getTransactionHistory(accountId);
    expect(transactions.length).toBe(successfulDeposits + successfulWithdraws);
  }, 60000);

  it('should handle rapid sequential operations', async () => {
    const accountId = 'test-rapid-sequential';
    await service.createAccount(accountId, 500);

    for (let i = 0; i < 20; i++) {
      const type =
        i % 2 === 0 ? TransactionType.DEPOSIT : TransactionType.WITHDRAW;
      await service.updateBalance(accountId, {
        amount: 10,
        type,
      });
    }

    const finalBalance = await service.getBalance(accountId);
    expect(finalBalance).toBe(500);

    const history = await service.getTransactionHistory(accountId);
    expect(history.length).toBe(20);
  });
});
