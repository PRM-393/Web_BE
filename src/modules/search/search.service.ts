import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Category } from '../../entities/category.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { Review } from '../../entities/review.entity';
import { CampaignStatus, DiscountType, ReviewStatus, VoucherType } from '../../common/enums/status.enum';
import { LocationDto, SearchVoucherDto, SortOption } from './dto/search-voucher.dto';

export function distanceKm(lat: number, lng: number, toLat: number, toLng: number) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(rad(toLat - lat) / 2) ** 2
    + Math.cos(rad(lat)) * Math.cos(rad(toLat)) * Math.sin(rad(toLng - lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

// Normalize different voucher types to percentages before filtering/sorting.
const DISCOUNT_SQL = `CASE WHEN c.voucherType = 'DISCOUNT' AND c.discountType = 'PERCENT'
  THEN COALESCE(c.discountValue, 0)
  WHEN c.voucherType = 'DISCOUNT' AND c.discountType = 'AMOUNT' AND c.faceValue > 0
  THEN 100.0 * c.discountValue / c.faceValue
  WHEN c.faceValue > 0 THEN 100.0 * (c.faceValue - c.salePrice) / c.faceValue ELSE 0 END`.replace(/\s+/g, ' ');

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(VoucherCampaign) private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(CampaignStore) private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
  ) {}

  listCategories() { return this.categoryRepo.find({ order: { displayOrder: 'ASC', name: 'ASC' } }); }

  private publicQuery() {
    return this.campaignRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.brand', 'brand')
      .where('c.status IN (:...statuses)', { statuses: [CampaignStatus.PUBLISHED, CampaignStatus.SOLD_OUT] })
      .andWhere('c.saleStartAt <= :now', { now: new Date() })
      .andWhere('c.saleEndAt > :now');
  }

  private present(c: VoucherCampaign) {
    const { brand, rejectReason, approvedBy, ...campaign } = c;
    const availableQuantity = Math.max(0, c.totalQuantity - c.soldQuantity - c.reservedQuantity);
    return { ...campaign,
      brand: brand ? { id: brand.id, name: brand.name, logo: brand.logo, description: brand.description } : null,
      availableQuantity,
      soldOut: c.status === CampaignStatus.SOLD_OUT || availableQuantity === 0,
      canPurchase: c.status === CampaignStatus.PUBLISHED && availableQuantity > 0,
    };
  }

  private async storesFor(ids: string[]) {
    if (!ids.length) return [];
    return this.campaignStoreRepo.find({
      where: { campaignId: In(ids), store: { status: true } }, relations: ['store'],
    });
  }

  async search(dto: SearchVoucherDto) {
    if (dto.minPrice !== undefined && dto.maxPrice !== undefined && dto.minPrice > dto.maxPrice
      || dto.minDiscount !== undefined && dto.maxDiscount !== undefined && dto.minDiscount > dto.maxDiscount) {
      throw new BadRequestException('Giá trị tối thiểu phải nhỏ hơn hoặc bằng giá trị tối đa.');
    }
    const hasLocation = !dto.locationDenied && dto.lat !== undefined && dto.lng !== undefined;
    if ((dto.radiusKm !== undefined || dto.sort === SortOption.DISTANCE_ASC) && !hasLocation && !dto.locationDenied) {
      throw new BadRequestException('Vui lòng cung cấp vị trí để tìm voucher gần bạn.');
    }
    const page = dto.page ?? 1, pageSize = dto.pageSize ?? 20;
    const qb = this.publicQuery();
    if (dto.categoryId) qb.andWhere('c.categoryId = :categoryId', { categoryId: dto.categoryId });
    if (dto.keyword?.trim()) {
      qb.andWhere('(LOWER(c.title) LIKE :kw OR LOWER(brand.name) LIKE :kw)', { kw: '%' + dto.keyword.trim().toLowerCase() + '%' });
    }
    if (dto.minPrice !== undefined) qb.andWhere('c.salePrice >= :minPrice', { minPrice: dto.minPrice });
    if (dto.maxPrice !== undefined) qb.andWhere('c.salePrice <= :maxPrice', { maxPrice: dto.maxPrice });
    if (dto.minDiscount !== undefined) qb.andWhere('(' + DISCOUNT_SQL + ') >= :minDiscount', { minDiscount: dto.minDiscount });
    if (dto.maxDiscount !== undefined) qb.andWhere('(' + DISCOUNT_SQL + ') <= :maxDiscount', { maxDiscount: dto.maxDiscount });
    switch (dto.sort) {
      case SortOption.PRICE_ASC: qb.orderBy('c.salePrice', 'ASC'); break;
      case SortOption.PRICE_DESC: qb.orderBy('c.salePrice', 'DESC'); break;
      case SortOption.DISCOUNT_DESC: qb.addSelect(DISCOUNT_SQL, 'discount_percent').orderBy('discount_percent', 'DESC'); break;
      case SortOption.BEST_SELLER: qb.orderBy('c.soldQuantity', 'DESC'); break;
      default: qb.orderBy('c.createdAt', 'DESC');
    }
    qb.addOrderBy('c.id', 'ASC');
    let items: any[], total: number;
    if (hasLocation) {
      // Filter against all matching campaigns before pagination so nearby results are never lost.
      const campaigns = await qb.getMany();
      const assignments = await this.storesFor(campaigns.map(c => c.id));
      const distances = new Map<string, number>();
      for (const { campaignId, store } of assignments) {
        if (store.latitude == null || store.longitude == null) continue;
        const distance = distanceKm(dto.lat!, dto.lng!, Number(store.latitude), Number(store.longitude));
        distances.set(campaignId, Math.min(distances.get(campaignId) ?? Infinity, distance));
      }
      items = campaigns.map(c => ({ ...this.present(c), distanceKm: distances.get(c.id) ?? null }))
        .filter(c => dto.radiusKm === undefined || c.distanceKm !== null && c.distanceKm <= dto.radiusKm!);
      if (!dto.sort || dto.sort === SortOption.DISTANCE_ASC) {
        items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.id.localeCompare(b.id));
      }
      total = items.length;
      items = items.slice((page - 1) * pageSize, page * pageSize);
    } else {
      const [campaigns, count] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
      items = campaigns.map(c => this.present(c));
      total = count;
    }
    return { items, total, page, pageSize, locationDenied: !!dto.locationDenied,
      message: dto.locationDenied ? 'Bạn chưa cho phép truy cập vị trí. Đang hiển thị danh sách mặc định.' : undefined };
  }

  async detail(id: string, location: LocationDto = {}) {
    const campaign = await this.publicQuery().andWhere('c.id = :id', { id }).getOne();
    if (!campaign) throw new NotFoundException('Không tìm thấy voucher đang công khai.');
    const assignments = await this.storesFor([id]);
    const stores = assignments.map(({ store }) => ({
      id: store.id, name: store.name, address: store.address, latitude: store.latitude,
      longitude: store.longitude, openingHours: store.openingHours, phone: store.phone,
      distanceKm: location.lat !== undefined && location.lng !== undefined && store.latitude != null && store.longitude != null
        ? distanceKm(location.lat, location.lng, Number(store.latitude), Number(store.longitude)) : null,
    })).sort((a,b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    const reviews = await this.reviewRepo.find({
      where: { campaignId: id, status: ReviewStatus.VISIBLE }, order: { createdAt: 'DESC' }, take: 20,
    });
    const summary = await this.reviewRepo.createQueryBuilder('r')
      .select('COUNT(r.id)', 'count').addSelect('AVG(r.rating)', 'average')
      .where('r.campaignId = :id', { id }).andWhere('r.status = :status', { status: ReviewStatus.VISIBLE }).getRawOne();
    return { ...this.present(campaign), stores,
      refundPolicy: { windowDays: 7, minDaysBeforeExpiry: 3,
        description: 'Voucher chưa sử dụng được yêu cầu hoàn trước mốc sớm hơn giữa 7 ngày kể từ thanh toán và 3 ngày trước hạn sử dụng.' },
      reviewCount: Number(summary?.count || 0), averageRating: Number(summary?.average || 0),
      reviews: reviews.map(r => ({ id: r.id, rating: r.rating, comment: r.comment, brandReply: r.brandReply, createdAt: r.createdAt })),
    };
  }
}
