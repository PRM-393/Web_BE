import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('campaign')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  @Roles(Role.BRAND_OWNER)
  @Post('brand/:brandId')
  create(@Param('brandId') brandId: string, @Body() dto: CreateCampaignDto) {
    return this.campaignService.create(brandId, dto);
  }

  @Roles(Role.BRAND_OWNER)
  @Get('brand/:brandId')
  findByBrand(@Param('brandId') brandId: string) {
    return this.campaignService.findByBrand(brandId);
  }

  @Roles(Role.BRAND_OWNER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaignService.update(id, dto);
  }

  @Roles(Role.BRAND_OWNER)
  @Patch(':id/submit')
  submit(@Param('id') id: string) {
    return this.campaignService.submitForApproval(id);
  }

  // FR-CAMP-14: rut chien dich dang cho duyet ve nhap de sua roi gui lai
  @Roles(Role.BRAND_OWNER)
  @Patch(':id/withdraw')
  withdraw(@Param('id') id: string) {
    return this.campaignService.withdraw(id);
  }

  @Roles(Role.BRAND_OWNER)
  @Patch(':id/pause')
  pause(@Param('id') id: string) {
    return this.campaignService.pause(id);
  }

  @Roles(Role.BRAND_OWNER)
  @Patch(':id/resume')
  resume(@Param('id') id: string) {
    return this.campaignService.resume(id);
  }

  @Roles(Role.ADMIN)
  @Get('pending')
  pending() {
    return this.campaignService.findPendingApproval();
  }

  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.campaignService.approve(id, user.userId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.campaignService.reject(id, reason);
  }

  @Roles(Role.BRAND_OWNER, Role.ADMIN)
  @Get(':id/stock')
  stock(@Param('id') id: string) {
    return this.campaignService.remainingStock(id);
  }
}
