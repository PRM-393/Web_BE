import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderScheduler } from './order.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Payment, VoucherCampaign, VoucherItem])],
  controllers: [OrderController],
  providers: [OrderService, OrderScheduler],
  exports: [OrderService],
})
export class OrderModule {}
