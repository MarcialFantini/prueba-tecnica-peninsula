export class UpdateBalanceResponseDto {
  success: boolean;
  transactionId: number;
  balanceAfter: number;
  version: number;
  wasRetried: boolean;
}
