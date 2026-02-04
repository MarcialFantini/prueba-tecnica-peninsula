// src/account/services/idempotency.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';

import { Transaction } from '../entities/transaction.entity';
import { UpdateBalanceResponseDto } from '../dto/update-balance-response.dto';

/**
 * Servicio responsable de manejar la idempotencia de las transacciones.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Asegura que exista una idempotency key.
   * Si no se provee, genera una nueva.
   */
  ensureKey(key?: string): string {
    return key || uuid();
  }

  /**
   * Busca un resultado previo para una idempotency key.
   */
  async getCachedResult(
    idempotencyKey: string,
  ): Promise<UpdateBalanceResponseDto | null> {
    const existingTx = await this.transactionRepository.findOne({
      where: { idempotencyKey },
    });

    if (!existingTx) {
      return null;
    }

    return {
      success: true,
      transactionId: existingTx.id,
      balanceAfter: Number(existingTx.balanceAfter),
      version: existingTx.version,
      wasRetried: false,
    };
  }

  /**
   * Valida que una idempotency key tenga un formato válido.
   */
  isValidKey(key: string): boolean {
    return typeof key === 'string' && key.length > 0 && key.length <= 50;
  }
}
