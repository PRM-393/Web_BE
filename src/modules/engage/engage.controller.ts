import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EngageService } from './engage.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('engage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class EngageController {
  constructor(private readonly engageService: EngageService) {}

  @Roles(Role.CUSTOMER)
  @Post('reviews')
  createReview(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReviewDto) {
    return this.engageService.createReview(user.userId, dto);
  }

  @Roles(Role.BRAND_OWNER)
  @Patch('reviews/:id/reply')
  reply(@Param('id') id: string, @Body('reply') reply: string) {
    return this.engageService.replyReview(id, reply);
  }

  @Roles(Role.BRAND_OWNER, Role.CUSTOMER, Role.ADMIN)
  @Get('brands/:brandId/reviews')
  listByBrand(@Param('brandId') brandId: string) {
    return this.engageService.listReviewsByBrand(brandId);
  }

  @Roles(Role.CUSTOMER)
  @Post('favorites')
  toggleFavorite(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateFavoriteDto) {
    return this.engageService.toggleFavorite(user.userId, dto);
  }

  @Roles(Role.CUSTOMER)
  @Get('favorites/me')
  myFavorites(@CurrentUser() user: CurrentUserPayload) {
    return this.engageService.listFavorites(user.userId);
  }

  @Roles(Role.CUSTOMER, Role.BRAND_OWNER, Role.STORE_STAFF, Role.ADMIN)
  @Get('notifications/me')
  myNotifications(@CurrentUser() user: CurrentUserPayload) {
    return this.engageService.listMyNotifications(user.userId);
  }

  @Roles(Role.CUSTOMER, Role.BRAND_OWNER, Role.STORE_STAFF, Role.ADMIN)
  @Post('notifications/device-token')
  registerDevice(
    @CurrentUser() user: CurrentUserPayload,
    @Body('token') token: string,
    @Body('platform') platform: string,
  ) {
    return this.engageService.registerDeviceToken(user.userId, token, platform);
  }
}
