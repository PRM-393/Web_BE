import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class ConfirmRefundDto {
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  @MaxLength(200)
  gatewayRefundId: string;
}
