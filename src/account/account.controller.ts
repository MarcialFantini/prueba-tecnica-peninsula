// src/accounts/accounts.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { UpdateBalanceResponseDto } from './dto/update-balance-response.dto';
import { AccountsService } from './account.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async getAccounts() {
    return this.accountsService.getAccounts();
  }

  @Post(':accountId/balance')
  @HttpCode(HttpStatus.OK)
  async updateBalance(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBalanceDto,
  ): Promise<UpdateBalanceResponseDto> {
    return this.accountsService.updateBalance(accountId, dto);
  }

  @Get(':accountId/balance')
  async getBalance(@Param('accountId') accountId: string) {
    const balance = await this.accountsService.getBalance(accountId);
    return { accountId, balance };
  }

  @Get(':accountId/transactions')
  async getTransactions(@Param('accountId') accountId: string) {
    return this.accountsService.getTransactionHistory(accountId);
  }
}
