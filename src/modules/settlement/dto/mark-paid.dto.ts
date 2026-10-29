import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// FR-SETTLE-07: danh dau phieu doi soat da chi tra. Truoc day controller nhan @Body('bankTxnRef') tho
// nen ma giao dich rong van lot, va ngay chi tra bi gan cung bang thoi diem bam nut - khong khai duoc
// lenh chuyen thuc hien tu hom truoc.
export class MarkPaidDto {
  @ApiProperty({ description: 'Ma giao dich ngan hang cua lenh chuyen', example: 'FT26102900123' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã giao dịch ngân hàng.' })
  @MaxLength(100, { message: 'Mã giao dịch ngân hàng tối đa 100 ký tự.' })
  bankTxnRef: string;

  @ApiProperty({ description: 'Ngay thuc hien lenh chuyen (ISO 8601)', example: '2026-11-02T03:00:00.000Z' })
  @IsDateString({}, { message: 'Vui lòng chọn ngày chi trả hợp lệ.' })
  paidAt: string;
}
