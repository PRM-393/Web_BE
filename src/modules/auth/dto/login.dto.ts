import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MinLength, IsOptional, IsString, MaxLength } from 'class-validator';

// FR-AUTH-06: BrandOwner, StoreStaff, Admin dang nhap bang email + mat khau
export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @MinLength(6)
  password: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}
