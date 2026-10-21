import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationScheduler } from './notification.scheduler';
import { NotificationService } from './notification.service';
import { PushSender } from './push-sender';

// @Global: module nao cung inject duoc NotificationService de goi notify() ma khong can import
@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationScheduler, PushSender],
  exports: [NotificationService],
})
export class NotificationModule {}
