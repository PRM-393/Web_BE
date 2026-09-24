import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

// FR-SETTLE-01: quan tri vien cau hinh mot ty le hoa hong chung cho toan san
export class SetCommissionDto {
  @ApiProperty({ description: 'Ty le tu 0 den 1, vi du 0.10 = 10%' })
  @IsNumber()
  @Min(0)
  @Max(1)
  rate: number;
}
