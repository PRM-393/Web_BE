import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('brand')
@ApiBearerAuth()
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateBrandDto) {
    return this.brandService.createBrand(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Get('me')
  findMine(@CurrentUser() user: CurrentUserPayload) {
    return this.brandService.findMyBrands(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.brandService.approve(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.brandService.reject(id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Post(':id/stores')
  createStore(@Param('id') brandId: string, @Body() dto: CreateStoreDto) {
    return this.brandService.createStore(brandId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER, Role.ADMIN)
  @Get(':id/stores')
  listStores(@Param('id') brandId: string) {
    return this.brandService.findStores(brandId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('stores/:storeId/deactivate')
  deactivateStore(@Param('storeId') storeId: string) {
    return this.brandService.deactivateStore(storeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Get(':id/staff')
  listStaff(@Param('id') brandId: string) {
    return this.brandService.findStaff(brandId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Post('staff')
  assignStaff(@Body() dto: CreateStaffDto) {
    return this.brandService.assignStaff(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @Patch('staff/:assignmentId/deactivate')
  deactivateStaff(@Param('assignmentId') assignmentId: string) {
    return this.brandService.deactivateStaff(assignmentId);
  }
}
