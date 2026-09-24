import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

// FR-REDEEM-02: khach hang xin token QR dong
export class RequestTokenDto {
  @ApiProperty()
  @IsUUID()
  voucherItemId: string;
}

// FR-REDEEM-05/06: nhan vien redeem bang QR (nonce) hoac OTP fallback
export class RedeemDto {
  @ApiProperty()
  @IsUUID()
  storeId: string;

  @ApiProperty({ required: false, description: 'Chuoi ngau nhien lay tu QR' })
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiProperty({ required: false, description: 'Ma OTP 6 chu so, dung khi khong quet duoc QR' })
  @IsOptional()
  @IsString()
  otpCode?: string;

  @ApiProperty({ required: false, description: 'Gia tri hoa don thuc te - FR-REDEEM-08' })
  @IsOptional()
  @IsNumber()
  billAmount?: number;
}
