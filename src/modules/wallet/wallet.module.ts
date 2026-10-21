import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { RefundRequest } from '../../entities/refund-request.entity';
import { Review } from '../../entities/review.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

// F10: vi voucher cua khach hang
@Module({
  imports: [TypeOrmModule.forFeature([VoucherItem, CampaignStore, RedemptionLog, RefundRequest, Review])],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
