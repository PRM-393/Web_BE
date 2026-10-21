import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { ConfirmRefundDto } from './dto/confirm-refund.dto';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Roles(Role.BRAND_OWNER)
  @Get('brands/:brandId/report')
  brandReport(@CurrentUser() user: CurrentUserPayload, @Param('brandId', ParseUUIDPipe) brandId: string, @Query() query: ReportQueryDto) {
    return this.reportService.brandReport(user.userId, brandId, query);
  }

  @Roles(Role.ADMIN)
  @Get('admin/dashboard')
  adminDashboard(@Query() query: ReportQueryDto) { return this.reportService.adminDashboard(query); }

  @Roles(Role.ADMIN)
  @Get('admin/pending/campaigns')
  pendingCampaigns() { return this.reportService.pendingCampaigns(); }

  @Roles(Role.ADMIN)
  @Get('admin/pending/brands')
  pendingBrands() { return this.reportService.pendingBrands(); }

  @Roles(Role.ADMIN)
  @Get('admin/payment-mismatches')
  mismatches() { return this.reportService.paymentMismatches(); }
  @Roles(Role.ADMIN)
  @Patch('admin/payment-mismatches/:id/confirm-refund')
  confirmMismatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: ConfirmRefundDto) {
    return this.reportService.confirmMismatch(id, user.userId, dto.gatewayRefundId);
  }
}
