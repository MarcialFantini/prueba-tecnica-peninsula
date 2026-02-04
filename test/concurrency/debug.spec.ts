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

  it('DEBUG: should show what happens with 10 concurrent withdrawals', async () => {
    const accountId = 'debug-account';
    await service.createAccount(accountId, 100);

    console.log('\n🔍 Starting 10 concurrent $10 withdrawals...');

    const promises = Array(10)
      .fill(null)
      .map((_, idx) =>
        service
          .updateBalance(accountId, {
            amount: 10,
            type: TransactionType.WITHDRAW,
          })
          .then((result) => {
            console.log(`✅ Request ${idx + 1} succeeded:`, {
              transactionId: result.transactionId,
              balanceAfter: result.balanceAfter,
              wasRetried: result.wasRetried,
            });
            return result;
          })
          .catch((err) => {
            console.log(`❌ Request ${idx + 1} failed:`, err.message);
            return { error: err };
          }),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => !('error' in r));
    const failures = results.filter((r) => 'error' in r);

    console.log(`\n📊 Results:`);
    console.log(`  - Successful promises: ${successes.length}`);
    console.log(`  - Failed promises: ${failures.length}`);

    const finalBalance = await service.getBalance(accountId);
    console.log(`  - Final balance: ${finalBalance}`);

    const transactions = await service.getTransactionHistory(accountId);
    console.log(`  - Actual transactions in DB: ${transactions.length}`);

    // Check for duplicate transaction IDs
    const txIds = successes.map((r: any) => r.transactionId);
    const uniqueTxIds = new Set(txIds);
    console.log(`  - Unique transaction IDs: ${uniqueTxIds.size}`);
    console.log(`  - Transaction IDs:`, txIds);

    if (uniqueTxIds.size !== txIds.length) {
      console.log('⚠️  DUPLICATE TRANSACTION IDs DETECTED!');
      const duplicates = txIds.filter((id, idx) => txIds.indexOf(id) !== idx);
      console.log('   Duplicates:', [...new Set(duplicates)]);
    }

    // This test is for debugging, so we just log everything
    expect(true).toBe(true);
  });

  it('DEBUG: should show idempotency keys being used', async () => {
    const accountId = 'debug-idempotency';
    await service.createAccount(accountId, 100);

    console.log('\n🔍 Checking idempotency key generation...');

    const promises = Array(5)
      .fill(null)
      .map(async (_, idx) => {
        const result = await service.updateBalance(accountId, {
          amount: 10,
          type: TransactionType.WITHDRAW,
        });

        const tx = await dataSource
          .getRepository(Transaction)
          .findOne({ where: { id: result.transactionId } });

        console.log(`Request ${idx + 1}:`, {
          transactionId: result.transactionId,
          idempotencyKey: tx?.idempotencyKey,
        });

        return result;
      });

    await Promise.all(promises);

    const transactions = await service.getTransactionHistory(accountId);
    console.log(`\nTotal transactions: ${transactions.length}`);

    expect(true).toBe(true);
  });
});
