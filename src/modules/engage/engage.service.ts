import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Brand } from '../../entities/brand.entity';
import { FavoriteTargetType } from '../../common/enums/status.enum';
import { Favorite } from '../../entities/favorite.entity';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

// Yeu thich (FR-ENGAGE-01). Danh gia nam o ReviewService (F15).
@Injectable()
export class EngageService {
  constructor(@InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>) {}

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

  // Kem ten / anh / gia cua chien dich hoac thuong hieu duoc yeu thich, de app khong phai goi tung muc
  async listFavorites(userId: string) {
    const favorites = await this.favoriteRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const ids = (type: FavoriteTargetType) => favorites.filter((f) => f.targetType === type).map((f) => f.targetId);
    const campaignIds = ids(FavoriteTargetType.CAMPAIGN);
    const brandIds = ids(FavoriteTargetType.BRAND);
    const m = this.favoriteRepo.manager;
    const [campaigns, brands] = await Promise.all([
      campaignIds.length ? m.find(VoucherCampaign, { where: { id: In(campaignIds) }, relations: ['brand'] }) : Promise.resolve([] as VoucherCampaign[]),
      brandIds.length ? m.find(Brand, { where: { id: In(brandIds) } }) : Promise.resolve([] as Brand[]),
    ]);
    const campaignById = new Map<string, VoucherCampaign>(campaigns.map((c) => [c.id, c] as const));
    const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b] as const));
    return favorites.map((f) => {
      if (f.targetType === FavoriteTargetType.CAMPAIGN) {
        const c = campaignById.get(f.targetId);
        return { ...f, title: c?.title ?? null, image: c?.image ?? null, salePrice: c?.salePrice ?? null, faceValue: c?.faceValue ?? null, status: c?.status ?? null, brandName: c?.brand?.name ?? null };
      }
      const b = brandById.get(f.targetId);
      return { ...f, title: b?.name ?? null, image: b?.logo ?? null, status: b?.status ?? null };
    });
  }
}
