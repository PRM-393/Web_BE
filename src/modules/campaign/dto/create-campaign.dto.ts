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
import { VoucherType } from '../../../common/enums/status.enum';

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

  @ApiProperty()
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  faceValue: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  discountPercent?: number;

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
