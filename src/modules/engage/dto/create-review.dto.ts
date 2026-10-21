import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ReviewStatus } from '../../../common/enums/status.enum';

// FR-ENGAGE-02/03: danh gia chien dich. Gui campaignId (app moi) hoac voucherItemId (tuong thich ban cu).
export class CreateReviewDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  voucherItemId?: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

// FR-ENGAGE-04: thuong hieu phan hoi mot lan
export class ReplyReviewDto {
  @ApiProperty()
  @IsString()
  @Matches(/\S/, { message: 'Nội dung phản hồi không được để trống.' })
  @MaxLength(1000)
  reply: string;
}

// FR-ENGAGE-05: quan tri vien an danh gia vi pham, ghi ly do vao AuditLog
export class HideReviewDto {
  @ApiProperty()
  @IsString()
  @Matches(/\S/, { message: 'Vui lòng nhập lý do ẩn đánh giá.' })
  @MaxLength(500)
  reason: string;
}

export class AdminReviewQueryDto extends PaginationQueryDto {
  @ApiProperty({ required: false, enum: ReviewStatus })
  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  status?: ReviewStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  brandId?: string;
}
