import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Account } from './entities/account.entity';
import { Transaction } from './entities/transaction.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { UpdateBalanceResponseDto } from './dto/update-balance-response.dto';
import { AccountsService } from './account.service';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({
    status: 201,
    description: 'The account has been successfully created.',
    type: Account,
  })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  async createAccount(@Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(undefined, dto.initialBalance);
  }

  @Get()
  @ApiOperation({ summary: 'Get all accounts' })
  @ApiResponse({
    status: 200,
    description: 'List of all accounts.',
    type: [Account],
  })
  async getAccounts() {
    return this.accountsService.getAccounts();
  }

  @Post(':accountId/balance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update account balance' })
  @ApiParam({ name: 'accountId', description: 'The ID of the account' })
  @ApiBody({ type: UpdateBalanceDto })
  @ApiResponse({
    status: 200,
    description: 'The balance has been successfully updated.',
    type: UpdateBalanceResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  async updateBalance(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBalanceDto,
  ): Promise<UpdateBalanceResponseDto> {
    return this.accountsService.updateBalance(accountId, dto);
  }

  @Get(':accountId/balance')
  @ApiOperation({ summary: 'Get account balance' })
  @ApiParam({ name: 'accountId', description: 'The ID of the account' })
  @ApiResponse({ status: 200, description: 'The account balance.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  async getBalance(@Param('accountId') accountId: string) {
    const balance = await this.accountsService.getBalance(accountId);
    return { accountId, balance };
  }

  @Get(':accountId/transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiParam({ name: 'accountId', description: 'The ID of the account' })
  @ApiResponse({
    status: 200,
    description: 'List of transactions for the account.',
    type: [Transaction],
  })
  async getTransactions(@Param('accountId') accountId: string) {
    return this.accountsService.getTransactionHistory(accountId);
  }
}
