import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Order } from '../../entities/order.entity';
import { Brand } from '../../entities/brand.entity';
import { Settlement } from '../../entities/settlement.entity';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCampaign, VoucherItem, Order, Brand, Settlement])],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
