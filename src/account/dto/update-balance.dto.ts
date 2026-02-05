import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { TransactionType } from '../entities/transaction.entity';

export class UpdateBalanceDto {
  /**
   * The type of transaction (deposit or withdraw)
   * @example 'deposit'
   */
  @IsEnum(TransactionType)
  type: TransactionType;

  /**
   * The amount to be deposited or withdrawn
   * @example 100.50
   */
  @IsNumber()
  @IsPositive()
  amount: number;
}
