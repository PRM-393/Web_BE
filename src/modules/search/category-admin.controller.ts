import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Category } from '../../entities/category.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

class CategoryDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(250) icon?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

// F03: admin-only catalog; a category referenced by any campaign cannot be deleted.
@ApiTags('categories') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
@Controller('admin/categories')
export class CategoryAdminController {
  constructor(private readonly db: DataSource) {}
  @Get() list() { return this.db.getRepository(Category).find({ order: { displayOrder: 'ASC', name: 'ASC' } }); }
  @Post() create(@Body() dto: CategoryDto) { return this.db.getRepository(Category).save(this.db.getRepository(Category).create(dto)); }
  @Patch(':id') async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto) {
    const repo = this.db.getRepository(Category);
    const category = await repo.findOneBy({ id });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục.');
    return repo.save(Object.assign(category, dto));
  }
  @Delete(':id') async remove(@Param('id', ParseUUIDPipe) id: string) {
    try {
      return await this.db.transaction(async manager => {
        const category = await manager.findOne(Category, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!category) throw new NotFoundException('Không tìm thấy danh mục.');
        if (await manager.exists(VoucherCampaign, { where: { categoryId: id } })) throw new BadRequestException('Không thể xóa danh mục đang có chiến dịch.');
        await manager.delete(Category, { id });
        return { message: 'Đã xóa danh mục.' };
      });
    } catch (error) {
      if (error?.driverError?.code === '23503' || error?.driverError?.errno === 1451) throw new BadRequestException('Danh mục đang được sử dụng.');
      throw error;
    }
  }
}
