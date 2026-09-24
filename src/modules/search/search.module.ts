import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Category } from '../../entities/category.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherCampaign, Category])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
