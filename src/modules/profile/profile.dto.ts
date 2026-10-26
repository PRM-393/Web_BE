import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// F17: cap nhat ho so khach hang (Form + validator tren app: ho ten bat buoc, so dien thoai Viet Nam)
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ tên tối thiểu 2 ký tự.' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự.' })
  fullName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0 hoặc +84.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'data:image/jpeg;base64,... hoặc data:image/png;base64,... (≤ 2 MB); chuỗi rỗng để xóa ảnh' })
  @IsOptional()
  @IsString()
  avatar?: string;
}
