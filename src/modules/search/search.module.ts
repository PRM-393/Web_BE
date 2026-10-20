import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Category } from '../../entities/category.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { Review } from '../../entities/review.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCampaign, Category, CampaignStore, Review])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
