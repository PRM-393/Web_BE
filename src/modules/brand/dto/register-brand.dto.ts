import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateBrandDto } from './create-brand.dto';

// FR-BRAND-01 / FR-BRAND-02: doanh nghiep tu dang ky ho so thuong hieu khi CHUA co tai khoan.
// POST /brands co san chi dung duoc khi da dang nhap bang vai tro BRAND_OWNER, nen truoc day
// khong co duong nao tao ra mot chu thuong hieu moi - moi thuong hieu deu phai den tu seed.
export class RegisterBrandDto extends CreateBrandDto {
  @ApiProperty({ description: 'Email chu thuong hieu, cung la tai khoan dang nhap', example: 'owner@brand.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  ownerEmail: string;

  @ApiProperty({ description: 'Ho ten nguoi dai dien', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên người đại diện.' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự.' })
  ownerFullName: string;

  @ApiProperty({ required: false, description: 'So dien thoai lien he' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ownerPhone?: string;
}
