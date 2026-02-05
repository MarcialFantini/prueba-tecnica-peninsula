import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from './account.service';
import { Account } from './entities/account.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionExecutor } from './services/transaction-executor.service';
import { TransactionType } from './entities/transaction.entity';
import { AccountNotFoundException } from './exceptions/account-not-found.exception';

describe('AccountsService', () => {
  let service: AccountsService;
  let accountRepository: Repository<Account>;
  let transactionExecutor: TransactionExecutor;

  const mockAccountRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockTransactionRepository = {
    find: jest.fn(),
  };

  const mockTransactionExecutor = {
    executeWithRetry: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: TransactionExecutor,
          useValue: mockTransactionExecutor,
        },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
    accountRepository = module.get(getRepositoryToken(Account));
    transactionExecutor = module.get(TransactionExecutor);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAccount', () => {
    it('should create and save an account', async () => {
      const accountId = '123';
      const initialBalance = 100;
      const mockAccount = { accountId, balance: initialBalance } as Account;

      mockAccountRepository.create.mockReturnValue(mockAccount);
      mockAccountRepository.save.mockResolvedValue(mockAccount);

      const result = await service.createAccount(accountId, initialBalance);

      expect(mockAccountRepository.create).toHaveBeenCalledWith({
        accountId,
        balance: initialBalance,
      });
      expect(mockAccountRepository.save).toHaveBeenCalledWith(mockAccount);
      expect(result).toEqual(mockAccount);
    });
  });

  describe('getBalance', () => {
    it('should return balance when account exists', async () => {
      const accountId = '123';
      const mockAccount = { accountId, balance: 500 } as Account;
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const result = await service.getBalance(accountId);

      expect(result).toBe(500);
    });

    it('should throw AccountNotFoundException when account does not exist', async () => {
      const accountId = '999';
      mockAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.getBalance(accountId)).rejects.toThrow(
        AccountNotFoundException,
      );
    });
  });

  describe('updateBalance', () => {
    it('should delegate to executor', async () => {
      const accountId = '123';
      const dto = {
        amount: 100,
        type: TransactionType.DEPOSIT,
      };
      const mockResult = {
        success: true,
        balanceAfter: 200,
        transactionId: 'tx-1',
        version: 2,
      };

      mockTransactionExecutor.executeWithRetry.mockResolvedValue(mockResult);

      const result = await service.updateBalance(accountId, dto);

      expect(transactionExecutor.executeWithRetry).toHaveBeenCalledWith(
        accountId,
        dto,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
