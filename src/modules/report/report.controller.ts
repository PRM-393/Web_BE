import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('report')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Roles(Role.BRAND_OWNER)
  @Get('brands/:brandId/report')
  brandReport(
    @Param('brandId') brandId: string,
    @Query('campaignId') campaignId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportService.brandReport(
      brandId,
      campaignId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Roles(Role.ADMIN)
  @Get('admin/dashboard')
  adminDashboard() {
    return this.reportService.adminDashboard();
  }

  @Roles(Role.ADMIN)
  @Get('admin/pending/campaigns')
  pendingCampaigns() {
    return this.reportService.pendingCampaigns();
  }

  @Roles(Role.ADMIN)
  @Get('admin/pending/brands')
  pendingBrands() {
    return this.reportService.pendingBrands();
  }
}
