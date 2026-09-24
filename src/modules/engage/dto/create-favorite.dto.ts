import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { FavoriteTargetType } from '../../../common/enums/status.enum';

// FR-ENGAGE-01
export class CreateFavoriteDto {
  @ApiProperty({ enum: FavoriteTargetType })
  @IsEnum(FavoriteTargetType)
  targetType: FavoriteTargetType;

  @ApiProperty()
  @IsUUID()
  targetId: string;
}
