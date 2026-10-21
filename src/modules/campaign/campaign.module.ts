import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
// BR-26: can tra trang thai thuong hieu truoc khi cho gui duyet chien dich
import { Brand } from '../../entities/brand.entity';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
// FR-CAMP-10: tac vu nen chuyen trang thai chien dich
import { CampaignScheduler } from './campaign.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCampaign, CampaignStore, Brand])],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignScheduler],
  exports: [CampaignService],
})
export class CampaignModule {}
