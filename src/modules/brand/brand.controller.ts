import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { RegisterBrandDto } from './dto/register-brand.dto';
import { RejectBrandDto } from './dto/reject-brand.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandResourceGuard } from '../../common/guards/brand-resource.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('brand')
@ApiBearerAuth()
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  // FR-BRAND-01/02: dang ky cong khai, chua co tai khoan. Tao chu thuong hieu PENDING_ACTIVATION +
  // ho so PENDING roi gui lien ket dat mat khau. Khong gan guard: day la cua vao cua nguoi chua dang nhap.
  @Post('register')
  register(@Body() dto: RegisterBrandDto) {
    return this.brandService.registerBrand(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateBrandDto) {
    return this.brandService.createBrand(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Get('me')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.brandService.findMyBrands(user.userId);
  }

  // FR-BRAND-09: quan tri xem tat ca thuong hieu (loc ?status=APPROVED|SUSPENDED|PENDING|REJECTED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  findAll(@Query('status') status?: string) {
    return this.brandService.findAll(status);
  }

  // F06 / FR-BRAND-07: trang thuong hieu cong khai, khong can dang nhap
  @Get(':id/public')
  publicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandService.publicProfile(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @Body() dto: RejectBrandDto, @CurrentUser() user: CurrentUserPayload) {
    return this.brandService.suspend(id, dto.reason, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/reinstate')
  reinstate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.brandService.reinstate(id, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.brandService.approve(id, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectBrandDto, @CurrentUser() user: CurrentUserPayload) {
    return this.brandService.reject(id, dto.reason, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Post(':id/stores')
  createStore(@Param('id') brandId: string, @Body() dto: CreateStoreDto) {
    return this.brandService.createStore(brandId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER, Role.ADMIN)
  @Get(':id/stores')
  listStores(@Param('id') brandId: string) {
    return this.brandService.findStores(brandId);
  }

  // FR-BRAND-04: sua chi nhanh, hoac mo lai chi nhanh da vo hieu (status = true)
  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('stores/:storeId')
  updateStore(@Param('storeId') storeId: string, @Body() dto: UpdateStoreDto) {
    return this.brandService.updateStore(storeId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('stores/:storeId/deactivate')
  deactivateStore(@Param('storeId') storeId: string) {
    return this.brandService.deactivateStore(storeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Get(':id/staff')
  listStaff(@Param('id') brandId: string) {
    return this.brandService.findStaff(brandId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Post('staff')
  assignStaff(@Body() dto: CreateStaffDto) {
    return this.brandService.assignStaff(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, BrandResourceGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('staff/:assignmentId/deactivate')
  deactivateStaff(@Param('assignmentId') assignmentId: string) {
    return this.brandService.deactivateStaff(assignmentId);
  }
}
