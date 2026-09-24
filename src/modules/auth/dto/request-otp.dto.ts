import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

// FR-AUTH-02: gui ma OTP qua email de dang nhap
export class RequestOtpDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
