import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettlementService } from './settlement.service';
import { SetCommissionDto } from './dto/set-commission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandResourceGuard } from '../../common/guards/brand-resource.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
@Controller()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Roles(Role.ADMIN)
  @Post('admin/commission-rate')
  setRate(@CurrentUser() user: CurrentUserPayload, @Body() dto: SetCommissionDto) {
    return this.settlementService.setCommissionRate(dto, user.userId);
  }

  // Tra kem nguoi sua / thoi diem sua gan nhat de man quan tri hien duoc (FR-SETTLE-01)
  @Roles(Role.ADMIN)
  @Get('admin/commission-rate')
  getRate() {
    return this.settlementService.getCommissionRateInfo();
  }

  @Roles(Role.ADMIN)
  @Get('admin/settlements')
  findAll() {
    return this.settlementService.findAll();
  }

  @Roles(Role.ADMIN)
  @Post('admin/settlements/run')
  run(@Body() body: { periodStart: string; periodEnd: string }) {
    return this.settlementService.runMonthlySettlement(
      new Date(body.periodStart),
      new Date(body.periodEnd),
    );
  }

  @Roles(Role.ADMIN)
  @Patch('admin/settlements/:id/mark-paid')
  markPaid(@Param('id') id: string, @Body('bankTxnRef') bankTxnRef: string) {
    return this.settlementService.markPaid(id, bankTxnRef);
  }

  @Roles(Role.BRAND_OWNER, Role.ADMIN)
  @Get('brands/:brandId/settlements')
  byBrand(@Param('brandId') brandId: string) {
    return this.settlementService.findByBrand(brandId);
  }

  @Roles(Role.BRAND_OWNER, Role.ADMIN)
  @Get('settlements/:id')
  detail(@Param('id') id: string) {
    return this.settlementService.detail(id);
  }
}
