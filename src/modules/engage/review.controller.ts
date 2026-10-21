import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminReviewQueryDto, HideReviewDto } from './dto/create-review.dto';
import { ReviewService } from './review.service';

// F15: danh gia theo chien dich (cong khai) va kiem duyet cua quan tri vien.
// Tao / phan hoi danh gia nam o EngageController (co BrandResourceGuard kiem tra quyen thuong hieu).
@ApiTags('review')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // Guest cung xem duoc (giong chi tiet voucher - FR-SEARCH-07)
  @Get('campaigns/:id/reviews')
  listByCampaign(@Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    return this.reviewService.listByCampaign(id, q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('campaigns/:id/reviews/eligibility')
  eligibility(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.eligibility(user.userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/reviews')
  listAdmin(@Query() q: AdminReviewQueryDto) {
    return this.reviewService.listAdmin(q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/reviews/:id/hide')
  hide(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HideReviewDto) {
    return this.reviewService.hide(id, user.userId, dto.reason);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/reviews/:id/unhide')
  unhide(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviewService.unhide(id, user.userId);
  }
}
