import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class EmailDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}

// FR-AUTH-09 (app): dat lai mat khau bang ma 6 so gui qua email
export class ResetCodeConfirmDto extends EmailDto {
  @ApiProperty({ description: 'Ma xac thuc 6 chu so' })
  @Matches(/^\d{6}$/)
  code: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}
