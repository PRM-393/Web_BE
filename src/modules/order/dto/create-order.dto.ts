import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

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
