import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Ma OTP 6 chu so' })
  @Matches(/^\d{6}$/)
  otp: string;
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}
