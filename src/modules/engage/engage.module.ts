import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from '../../entities/review.entity';
import { Favorite } from '../../entities/favorite.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { EngageController } from './engage.controller';
import { EngageService } from './engage.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Favorite, VoucherItem]),
  ],
  controllers: [EngageController, ReviewController],
  providers: [EngageService, ReviewService],
  exports: [ReviewService],
})
export class EngageModule {}
