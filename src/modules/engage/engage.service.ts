import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../../entities/review.entity';
import { Favorite } from '../../entities/favorite.entity';
import { Notification } from '../../entities/notification.entity';
import { DeviceToken } from '../../entities/device-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherItemStatus } from '../../common/enums/status.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class EngageService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(DeviceToken) private readonly deviceTokenRepo: Repository<DeviceToken>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
  ) {}

  // FR-ENGAGE-02/03, BR-10: chi voucher da redeem moi duoc danh gia, moi voucher mot lan
  async createReview(userId: string, dto: CreateReviewDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) throw new NotFoundException('Khong tim thay voucher.');
    if (item.status !== VoucherItemStatus.USED) {
      throw new BadRequestException('Chi voucher da su dung moi duoc danh gia.');
    }
    const existing = await this.reviewRepo.findOne({ where: { voucherItemId: item.id } });
    if (existing) throw new BadRequestException('Voucher nay da duoc danh gia.');

    const review = this.reviewRepo.create({
      voucherItemId: item.id,
      userId,
      brandId: item.campaignId, // TODO: lay dung brandId tu campaign.brandId (can join)
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
    return this.reviewRepo.save(review);
  }

  listReviewsByBrand(brandId: string) {
    return this.reviewRepo.find({ where: { brandId } });
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

  // FR-ENGAGE-06/07: gui thong bao day - TODO: tich hop Firebase Cloud Messaging that su
  async notify(userId: string, type: string, title: string, body: string) {
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({ userId, type, title, body }),
    );
    const tokens = await this.deviceTokenRepo.find({ where: { userId } });
    // TODO: goi Firebase Admin SDK gui push toi tokens.map(t => t.token)
    return { notification, devicesNotified: tokens.length };
  }

  listMyNotifications(userId: string) {
    return this.notificationRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    const existing = await this.deviceTokenRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      return this.deviceTokenRepo.save(existing);
    }
    return this.deviceTokenRepo.save(this.deviceTokenRepo.create({ userId, token, platform }));
  }
}
