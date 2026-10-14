import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Category } from '../../entities/category.entity';
import { Brand } from '../../entities/brand.entity';
import { CampaignStatus } from '../../common/enums/status.enum';
import { SearchVoucherDto, SortOption } from './dto/search-voucher.dto';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
  ) {}

  listCategories() {
    return this.categoryRepo.find({ order: { displayOrder: 'ASC' } });
  }

  // FR-SEARCH-01..08: chi hien thi chien dich PUBLISHED va trong thoi gian ban (FR-SEARCH-08)
  async search(dto: SearchVoucherDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const qb = this.campaignRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: CampaignStatus.PUBLISHED })
      .andWhere('c.saleStartAt <= :now', { now: new Date() })
      .andWhere('c.saleEndAt >= :now2', { now2: new Date() });

    if (dto.categoryId) {
      // Subquery qua entity de TypeORM tu dat ten cot dung cho PostgreSQL / MySQL
      const brandsInCategory = qb
        .subQuery()
        .select('b.id')
        .from(Brand, 'b')
        .where('b.categoryId = :categoryId')
        .getQuery();
      qb.andWhere(`c.brandId IN ${brandsInCategory}`, { categoryId: dto.categoryId });
    }
    if (dto.keyword) {
      // Khong phan biet hoa thuong tren ca PostgreSQL va MySQL (thay cho ILIKE chi co o PostgreSQL)
      qb.andWhere('LOWER(c.title) LIKE :kw', { kw: `%${dto.keyword.toLowerCase()}%` });
    }
    if (dto.minPrice !== undefined) qb.andWhere('c.salePrice >= :minPrice', { minPrice: dto.minPrice });
    if (dto.maxPrice !== undefined) qb.andWhere('c.salePrice <= :maxPrice', { maxPrice: dto.maxPrice });

    switch (dto.sort) {
      case SortOption.PRICE_ASC:
        qb.orderBy('c.salePrice', 'ASC');
        break;
      case SortOption.PRICE_DESC:
        qb.orderBy('c.salePrice', 'DESC');
        break;
      case SortOption.DISCOUNT_DESC:
        qb.orderBy('c.discountPercent', 'DESC');
        break;
      case SortOption.BEST_SELLER:
        qb.orderBy('c.soldQuantity', 'DESC');
        break;
      default:
        qb.orderBy('c.createdAt', 'DESC');
    }

    // TODO(FR-SEARCH-05/06): khi lat/lng/radiusKm duoc truyen, loc va sap xep theo khoang cach
    // toi cac Store cua CampaignStore bang cong thuc Haversine (xem Mobile/src/utils/distance.ts).
    // Neu khach tu choi vi tri, tra ve danh sach mac dinh kem co "locationDenied: true".

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  // FR-SEARCH-07: chi tiet voucher
  async detail(id: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Khong tim thay voucher.');
    // TODO: nap kem danh sach chi nhanh ap dung kem khoang cach, chinh sach hoan tien
    return campaign;
  }
}
