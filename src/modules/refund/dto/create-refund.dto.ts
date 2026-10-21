import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

// FR-REFUND-01
export class CreateRefundDto {
  @ApiProperty()
  @IsUUID()
  voucherItemId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// UC-07: quan tri vien khong hoan duoc tien, ghi ly do (bat buoc)
export class FailManualRefundDto {
  @ApiProperty()
  @IsString()
  @Matches(/\S/, { message: 'Vui lòng nhập lý do không hoàn được.' })
  @MaxLength(500)
  reason: string;
}
