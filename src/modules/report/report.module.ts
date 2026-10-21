import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Order } from '../../entities/order.entity';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCampaign, VoucherItem, Order, Brand, Store])],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
