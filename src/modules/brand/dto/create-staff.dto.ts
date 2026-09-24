import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsUUID } from 'class-validator';

// FR-BRAND-05: thuong hieu tao tai khoan nhan vien va gan chi nhanh
export class CreateStaffDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsUUID()
  storeId: string;
}
