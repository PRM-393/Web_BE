import { IsDateString, IsOptional, IsUUID } from 'class-validator';
export class ReportQueryDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string;
  @IsOptional()
  @IsUUID()
  storeId?: string;
  @IsOptional()
  @IsDateString()
  from?: string;
  @IsOptional()
  @IsDateString()
  to?: string;
}
