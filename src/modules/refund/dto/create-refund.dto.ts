import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

// FR-REFUND-01
export class CreateRefundDto {
  @ApiProperty()
  @IsUUID()
  voucherItemId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
