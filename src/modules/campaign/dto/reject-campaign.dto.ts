import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// UC-04 luong 3a / FR-CAMP-07: tu choi chien dich thi BAT BUOC co ly do - chien dich quay ve DRAFT
// kem ly do de thuong hieu biet phai sua gi. Truoc day controller nhan @Body('reason') tho nen
// tu choi voi ly do rong van lot, thuong hieu nhan ve mot chien dich DRAFT khong kem giai thich nao.
export class RejectCampaignDto {
  @ApiProperty({ description: 'Ly do tu choi, hien lai cho thuong hieu', example: 'Hạn sử dụng quá sát ngày kết thúc bán.' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do từ chối.' })
  @MinLength(10, { message: 'Lý do từ chối cần ít nhất 10 ký tự để thương hiệu biết phải sửa gì.' })
  @MaxLength(500, { message: 'Lý do từ chối tối đa 500 ký tự.' })
  reason: string;
}
