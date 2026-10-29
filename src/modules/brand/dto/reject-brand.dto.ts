import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// UC-06 / FR-BRAND-03: tu choi ho so thuong hieu bat buoc kem ly do - ly do nay duoc gui vao email
// cho chu thuong hieu, nen rong la vo nghia. Dung chung cho ca dinh chi (FR-BRAND-09).
export class RejectBrandDto {
  @ApiProperty({ example: 'Giấy phép kinh doanh không khớp tên thương hiệu đăng ký.' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập lý do.' })
  @MinLength(10, { message: 'Lý do cần ít nhất 10 ký tự để thương hiệu biết phải bổ sung gì.' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự.' })
  reason: string;
}
