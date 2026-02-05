import { IsNumber, IsOptional } from 'class-validator';

export class CreateAccountDto {
  /**
   * The initial balance for the account
   * @example 1000.00
   */
  @IsNumber()
  @IsOptional()
  initialBalance?: number;
}
