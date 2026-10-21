import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { WALLET_TABS, WalletTab } from './wallet.rules';
import { WalletService } from './wallet.service';

export class WalletQueryDto {
  @ApiProperty({ required: false, enum: WALLET_TABS, description: 'Bo trong de lay ca vi' })
  @IsOptional()
  @IsIn(WALLET_TABS)
  tab?: WalletTab;
}

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // FR-REDEEM-01: vi voucher theo tab ACTIVE (gom REFUND_PENDING) / USED / EXPIRED / REFUNDED
  @Get()
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: WalletQueryDto) {
    return this.walletService.list(user.userId, query.tab);
  }

  // Chi tiet voucher da mua: chi nhanh ap dung, lan su dung, yeu cau hoan, dieu kien hoan / danh gia
  @Get(':id')
  detail(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.walletService.detail(user.userId, id);
  }
}
