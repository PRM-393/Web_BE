import { IsEmail, IsString, IsUUID, Length, MinLength, MaxLength } from 'class-validator';

export class ActivationRequestDto {
  @IsEmail()
  email: string;
}
export class ActivateDto extends ActivationRequestDto {
  @IsString()
  @Length(64, 64)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
export class SelectStoreDto {
  @IsUUID()
  storeId: string;
}
