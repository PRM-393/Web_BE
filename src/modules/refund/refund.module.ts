import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefundRequest } from '../../entities/refund-request.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';

@Module({
  imports: [TypeOrmModule.forFeature([RefundRequest, VoucherItem, VoucherCampaign])],
  controllers: [RefundController],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
