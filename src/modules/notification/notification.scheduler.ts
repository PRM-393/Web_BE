import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

// FR-ENGAGE-07: 9 gio sang (gio Viet Nam) moi ngay nhac voucher het han sau 7 ngay va sau 1 ngay
@Injectable()
export class NotificationScheduler {
  constructor(private readonly notifications: NotificationService) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  remindExpiring() {
    return this.notifications.remindExpiringVouchers();
  }
}
