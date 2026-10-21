import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderService } from './order.service';

// FR-ORDER-03, NFR-REL-04: moi 5 phut huy don PENDING qua thoi gian giu cho va nha ton kho
@Injectable()
export class OrderScheduler {
  constructor(private readonly orderService: OrderService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  cancelExpired() {
    return this.orderService.cancelExpiredOrders();
  }
}
