import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

// FR-REDEEM-02: khach hang xin token QR dong
export class RequestTokenDto {
  @ApiProperty()
  @IsUUID()
  voucherItemId: string;
}

// FR-REDEEM-05/06: nhan vien gui nguyen chuoi QR (may chu kiem chu ky) hoac OTP 6 so. Chi gui mot trong hai.
export class RedeemDto {
  @ApiProperty()
  @IsUUID()
  storeId: string;

  @ApiProperty({ required: false, description: 'Nguyen chuoi doc tu ma QR: v1.<nonce>.<expiresAtMs>.<chu ky>' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrPayload?: string;

  @ApiProperty({ required: false, description: 'Ma OTP 6 chu so, dung khi khong quet duoc QR' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'Mã OTP gồm đúng 6 chữ số.' })
  otpCode?: string;

  @ApiProperty({ required: false, description: 'Gia tri hoa don (VND); bat buoc voi voucher menh gia - BR-03' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  billAmount?: number;
}

// FR-REDEEM-08: sua gia tri hoa don trong 10 phut sau khi xac nhan
export class UpdateBillDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  billAmount: number;
}
