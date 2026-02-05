import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Account } from './account.entity';

/**
 * The type of transaction.
 */
export enum TransactionType {
  /** Deposit funds into the account */
  DEPOSIT = 'deposit',
  /** Withdraw funds from the account */
  WITHDRAW = 'withdraw',
}

@Entity('transactions')
export class Transaction {
  /** The unique ID of the transaction */
  @PrimaryGeneratedColumn()
  id: number;

  /** The ID of the account this transaction belongs to */
  @Column({ name: 'account_id', length: 50 })
  accountId: string;

  /** The amount of the transaction */
  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  /**
   * The type of the transaction
   * @example 'deposit'
   */
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  /** The balance of the account BEFORE this transaction */
  @Column('decimal', { name: 'balance_before', precision: 18, scale: 2 })
  balanceBefore: number;

  /** The balance of the account AFTER this transaction */
  @Column('decimal', { name: 'balance_after', precision: 18, scale: 2 })
  balanceAfter: number;

  /** The version of the account state at the time of this transaction */
  @Column()
  version: number;

  /** The date and time when the transaction was created */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Account, (account) => account.transactions)
  @JoinColumn({ name: 'account_id' })
  account: Account;
}
