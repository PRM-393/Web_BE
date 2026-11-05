import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

// FR-ORDER-01
export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  campaignId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;
}

// Thanh toan cac voucher da chon trong gio hang bang mot ma QR
export class CreateCheckoutDto {
  @ApiProperty({ type: [CreateOrderDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  items: CreateOrderDto[];
}
