import { TestingModule, Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AccountsService } from 'src/account/account.service';
import { Account } from 'src/account/entities/account.entity';
import {
  Transaction,
  TransactionType,
} from 'src/account/entities/transaction.entity';
import { AccountNotFoundException } from 'src/account/exeptions/account-not-found.exception';
import { TransactionExecutor } from 'src/account/services/transaction-executor.service';
import { RetryStrategy } from 'src/account/services/retry-strategy.service';
import { DataSource } from 'typeorm';

describe('AccountsService - Basic Functionality', () => {
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

  it('should create an account with initial balance', async () => {
    const account = await service.createAccount('test-001', 1000);
    expect(account.accountId).toBe('test-001');
    expect(Number(account.balance)).toBe(1000);
    expect(account.version).toBe(1);
  });

  it('should get account balance', async () => {
    await service.createAccount('test-002', 500);
    const balance = await service.getBalance('test-002');
    expect(balance).toBe(500);
  });

  it('should throw AccountNotFoundException for non-existent account', async () => {
    await expect(service.getBalance('non-existent')).rejects.toThrow(
      AccountNotFoundException,
    );
  });

  it('should perform a simple deposit', async () => {
    await service.createAccount('test-003', 100);
    const result = await service.updateBalance('test-003', {
      amount: 50,
      type: TransactionType.DEPOSIT,
    });

    expect(result.success).toBe(true);
    expect(result.balanceAfter).toBe(150);
    expect(result.wasRetried).toBe(false);
  });

  it('should perform a simple withdrawal', async () => {
    await service.createAccount('test-004', 100);
    const result = await service.updateBalance('test-004', {
      amount: 30,
      type: TransactionType.WITHDRAW,
    });

    expect(result.success).toBe(true);
    expect(result.balanceAfter).toBe(70);
  });

  it('should retrieve transaction history', async () => {
    await service.createAccount('test-005', 100);
    await service.updateBalance('test-005', {
      amount: 50,
      type: TransactionType.DEPOSIT,
    });
    await service.updateBalance('test-005', {
      amount: 20,
      type: TransactionType.WITHDRAW,
    });

    const history = await service.getTransactionHistory('test-005');
    expect(history.length).toBe(2);
    expect(history[0].type).toBe(TransactionType.WITHDRAW); // DESC order
    expect(history[1].type).toBe(TransactionType.DEPOSIT);
  });
});
