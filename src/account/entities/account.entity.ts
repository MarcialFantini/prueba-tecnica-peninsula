import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Check,
} from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity('accounts')
@Check('"balance" >= 0') // Constraint de DB
export class Account {
  /** The unique ID of the account */
  @PrimaryColumn({ name: 'account_id', length: 50 })
  accountId: string;

  /** The current balance of the account */
  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  balance: number;

  /** The optimistic locking version of the account */
  @VersionColumn() // Optimistic locking version
  version: number;

  /** The date and time when the account was created */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** The date and time when the account was last updated */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];
}
