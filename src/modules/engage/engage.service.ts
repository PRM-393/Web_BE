import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../entities/review.entity';
import { Favorite } from '../../entities/favorite.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherItemStatus } from '../../common/enums/status.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class EngageService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
  ) {}

  // FR-ENGAGE-02/03, BR-10: chi voucher da redeem moi duoc danh gia, moi voucher mot lan
  async createReview(userId: string, dto: CreateReviewDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) throw new NotFoundException('Khong tim thay voucher.');
    if (item.status !== VoucherItemStatus.USED) {
      throw new BadRequestException('Chi voucher da su dung moi duoc danh gia.');
    }
    // DC-09: moi khach mot danh gia cho moi chien dich
    const existing = await this.reviewRepo.findOne({ where: { userId, campaignId: item.campaignId } });
    if (existing) throw new BadRequestException('Ban da danh gia chien dich nay.');

    const review = this.reviewRepo.create({
      campaignId: item.campaignId,
      voucherItemId: item.id,
      userId,
      rating: dto.rating,
      comment: dto.comment,
    });
    return this.reviewRepo.save(review);
  }

  // FR-ENGAGE-04: thuong hieu phan hoi cong khai mot lan cho moi danh gia
  async replyReview(reviewId: string, reply: string) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Khong tim thay danh gia.');
    if (review.brandReply) throw new BadRequestException('Danh gia nay da duoc phan hoi.');
    review.brandReply = reply;
    review.brandRepliedAt = new Date();
    return this.reviewRepo.save(review);
  }

  listReviewsByBrand(brandId: string) {
    return this.reviewRepo.find({ where: { campaign: { brandId } }, order: { createdAt: 'DESC' } });
  }

  // FR-ENGAGE-01
  async toggleFavorite(userId: string, dto: CreateFavoriteDto) {
    const existing = await this.favoriteRepo.findOne({
      where: { userId, targetType: dto.targetType, targetId: dto.targetId },
    });
    if (existing) {
      await this.favoriteRepo.remove(existing);
      return { favorited: false };
    }
    await this.favoriteRepo.save(this.favoriteRepo.create({ userId, ...dto }));
    return { favorited: true };
  }

  listFavorites(userId: string) {
    return this.favoriteRepo.find({ where: { userId } });
  }

}
