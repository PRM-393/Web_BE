import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateStoreDto } from './create-store.dto';

// FR-BRAND-04: sua chi nhanh. Moi truong deu tuy chon; rieng status dung de vo hieu hoa hoac mo lai
// chi nhanh. Mo lai ma thieu toa do bi tu choi o service (DC-05).
export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @ApiProperty({ required: false, description: 'false de vo hieu hoa (BR-24), true de mo lai (DC-05)' })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
