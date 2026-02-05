export class UpdateBalanceResponseDto {
  /**
   * Indicates if the transaction was successful
   * @example true
   */
  success: boolean;

  /**
   * The ID of the created transaction
   * @example 123
   */
  transactionId: number;

  /**
   * The new balance after the transaction
   * @example 1500.00
   */
  balanceAfter: number;

  /**
   * The new version of the account
   * @example 5
   */
  version: number;

  /**
   * Indicates if the transaction was retried due to concurrency
   * @example false
   */
  wasRetried: boolean;
}
