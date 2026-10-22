import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

// FR-SETTLE-01: quan tri vien cau hinh mot ty le hoa hong chung cho toan san.
// Khoang hop le 0 < rate < 1 duoc kiem o validateCommissionRate() trong service,
// de thong bao loi va nguong chi viet mot cho (dung cho ca duong DTO lan goi noi bo).
export class SetCommissionDto {
  @ApiProperty({ description: 'Ty le lon hon 0 va nho hon 1, vi du 0.10 = 10%', example: 0.1 })
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'Tỷ lệ hoa hồng phải là số, tối đa 4 chữ số thập phân (ví dụ 0.1 hoặc 0.075).' },
  )
  rate: number;
}
