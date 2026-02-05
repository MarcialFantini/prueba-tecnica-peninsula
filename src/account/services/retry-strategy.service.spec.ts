import { Test, TestingModule } from '@nestjs/testing';
import { RetryStrategy } from './retry-strategy.service';
import { ConcurrencyException } from '../exeptions/concurrency.exception';
import { AccountNotFoundException } from '../exeptions/account-not-found.exception';

describe('RetryStrategy', () => {
  let service: RetryStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryStrategy],
    }).compile();

    service = module.get<RetryStrategy>(RetryStrategy);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return result on first success', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const result = await service.executeWithRetry(operation);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const config = { baseBackoffMs: 1, jitterMs: 0 };
    const result = await service.executeWithRetry(operation, {}, config);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw ConcurrencyException when max retries exceeded', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fail'));
    const config = { maxRetries: 3, baseBackoffMs: 1, jitterMs: 0 };

    await expect(
      service.executeWithRetry(operation, {}, config),
    ).rejects.toThrow(ConcurrencyException);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on non-retryable errors', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new AccountNotFoundException('id'));

    await expect(service.executeWithRetry(operation)).rejects.toThrow(
      AccountNotFoundException,
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
