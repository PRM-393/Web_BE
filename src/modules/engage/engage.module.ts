import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from '../../entities/review.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Notification } from '../../entities/notification.entity';
import { DeviceToken } from '../../entities/device-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { EngageController } from './engage.controller';
import { EngageService } from './engage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Favorite, Notification, DeviceToken, VoucherItem]),
  ],
  controllers: [EngageController],
  providers: [EngageService],
})
export class EngageModule {}
