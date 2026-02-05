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
import { DataSource } from 'typeorm';

describe('Debug Concurrent Operations', () => {
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

  it('DEBUG: should show what happens with 10 concurrent withdrawals', async () => {
    const accountId = 'debug-account';
    await service.createAccount(accountId, 100);

    console.log('\nStarting 10 concurrent $10 withdrawals...');

    const promises = Array(10)
      .fill(null)
      .map((_, idx) =>
        service
          .updateBalance(accountId, {
            amount: 10,
            type: TransactionType.WITHDRAW,
          })
          .then((result) => {
            console.log(`Request ${idx + 1} succeeded:`, {
              transactionId: result.transactionId,
              balanceAfter: result.balanceAfter,
              wasRetried: result.wasRetried,
            });
            return result;
          })
          .catch((err) => {
            console.log(`Request ${idx + 1} failed:`, err.message);
            return { error: err };
          }),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r));
    const failures = results.filter((r) => 'error' in r);

    console.log(`\nResults:`);
    console.log(`  - Successful promises: ${successes.length}`);
    console.log(`  - Failed promises: ${failures.length}`);

    // Check for transaction history
    const finalBalance = await service.getBalance(accountId);
    console.log(`  - Final balance: ${finalBalance}`);

    const transactions = await service.getTransactionHistory(accountId);
    console.log(`  - Actual transactions in DB: ${transactions.length}`);

    // This test is for debugging, so we just log everything
    expect(true).toBe(true);
  });
});
