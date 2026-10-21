import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefundRequest } from '../../entities/refund-request.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { RefundGateway, SandboxRefundGateway } from './refund-gateway';

@Module({
  imports: [TypeOrmModule.forFeature([RefundRequest, VoucherItem, VoucherCampaign])],
  controllers: [RefundController],
  // Doi sang cong hoan tien that: thay useClass bang lop ke thua RefundGateway
  providers: [RefundService, { provide: RefundGateway, useClass: SandboxRefundGateway }],
  exports: [RefundService],
})
export class RefundModule {}
