import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EngageService } from './engage.service';
import { ReviewService } from './review.service';
import { CreateReviewDto, ReplyReviewDto } from './dto/create-review.dto';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandResourceGuard } from '../../common/guards/brand-resource.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('engage')
@ApiBearerAuth()
// BrandResourceGuard khong gan o cap class: no doi chieu :brandId / :id voi thuong hieu cua nguoi goi,
// trong khi danh sach danh gia cua mot thuong hieu la du lieu CONG KHAI (F06 / F15). Gan ca cum thi
// mot tai khoan BRAND_OWNER xem trang thuong hieu khac bi 403 - chan thua, khong phai lo hong.
// Chi route sua du lieu cua thuong hieu (tra loi danh gia) moi can guard do.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class EngageController {
  constructor(
    private readonly engageService: EngageService,
    private readonly reviewService: ReviewService,
  ) {}

  @Roles(Role.CUSTOMER)
  @Post('reviews')
  createReview(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(user.userId, dto);
  }

  // NFR-SEC-03: chi tra loi duoc danh gia thuoc chien dich cua chinh minh
  @UseGuards(BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('reviews/:id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyReviewDto) {
    return this.reviewService.reply(id, dto.reply);
  }

  @Roles(Role.BRAND_OWNER, Role.CUSTOMER, Role.ADMIN)
  @Get('brands/:brandId/reviews')
  listByBrand(@Param('brandId') brandId: string) {
    return this.reviewService.listByBrand(brandId);
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
}
