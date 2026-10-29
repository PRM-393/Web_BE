import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// FR-SETTLE-03: quan tri vien chay chot doi soat bang tay (tac vu nen loi, hoac can chot giua ky).
// Truoc day controller nhan { periodStart, periodEnd } tho: chuoi rong hoac sai dinh dang di thang vao
// new Date() thanh Invalid Date, truy van so sanh voi NaN nen phieu sinh ra rong ma khong bao loi gi.
// Bo trong ca hai thi lay dung ky ma tac vu nen se chot: thang truoc theo lich Viet Nam (BR-25).
export class RunSettlementDto {
  @ApiPropertyOptional({ description: 'Dau ky (ISO 8601); bo trong = thang truoc theo gio VN' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày đầu kỳ không hợp lệ.' })
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Cuoi ky (ISO 8601); bo trong = thang truoc theo gio VN' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày cuối kỳ không hợp lệ.' })
  periodEnd?: string;
}
