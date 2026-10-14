import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { DiscountType, VoucherType } from '../../../common/enums/status.enum';

// FR-CAMP-01/02/03/04/05
export class CreateCampaignDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiProperty({ enum: VoucherType })
  @IsEnum(VoucherType)
  voucherType: VoucherType;

  // gia ban phai lon hon 0 (FR-CAMP-12)
  @ApiProperty()
  @IsInt()
  @Min(1)
  salePrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  faceValue: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // FR-CAMP-12: bat buoc khi voucherType = DISCOUNT
  @ApiProperty({ required: false, enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiProperty({ required: false, description: 'AMOUNT: so tien VND; PERCENT: 1..100' })
  @IsOptional()
  @IsInt()
  @Min(1)
  discountValue?: number;

  @ApiProperty({ required: false, description: 'Muc giam toi da, bat buoc khi PERCENT' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscount?: number;

  @ApiProperty({ required: false, description: 'Noi dung goi, bat buoc khi voucherType = COMBO' })
  @IsOptional()
  @IsString()
  comboItems?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalQuantity: number;

  @ApiProperty({ required: false, default: 5, description: 'Gioi han mua moi nguoi - BR-01' })
  @IsOptional()
  @IsInt()
  @Min(1)
  limitPerUser?: number;

  @ApiProperty()
  @IsDateString()
  saleStartAt: string;

  @ApiProperty()
  @IsDateString()
  saleEndAt: string;

  @ApiProperty()
  @IsDateString()
  voucherExpireAt: string;

  @ApiProperty({ type: [String], description: 'Danh sach storeId ap dung - FR-CAMP-03, DC-07' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  storeIds: string[];
}
