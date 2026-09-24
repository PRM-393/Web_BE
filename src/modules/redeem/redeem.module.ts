import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedeemToken } from '../../entities/redeem-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { RedeemController } from './redeem.controller';
import { RedeemService } from './redeem.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RedeemToken, VoucherItem, RedemptionLog, CampaignStore, StaffAssignment]),
  ],
  controllers: [RedeemController],
  providers: [RedeemService],
  exports: [RedeemService],
})
export class RedeemModule {}
