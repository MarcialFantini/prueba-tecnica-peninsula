import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { TransactionType } from '../entities/transaction.entity';

export class UpdateBalanceDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
