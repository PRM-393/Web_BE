import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Ma OTP 6 chu so' })
  @Length(6, 6)
  otp: string;
}
