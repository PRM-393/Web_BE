import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NOTIFICATION_TYPE_LABELS, NotificationType } from './notification.service';

export class UpdateNotificationSettingDto {
  @ApiProperty({ enum: Object.keys(NOTIFICATION_TYPE_LABELS) })
  @IsIn(Object.keys(NOTIFICATION_TYPE_LABELS))
  type: NotificationType;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class RegisterDeviceTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  @IsIn(['android', 'ios', 'web'])
  platform: string;
}
