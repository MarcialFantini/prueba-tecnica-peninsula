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
  @PrimaryColumn({ name: 'account_id', length: 50 })
  accountId: string;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  balance: number;

  @VersionColumn() // Optimistic locking version
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];
}
