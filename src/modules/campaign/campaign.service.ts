import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { Brand } from '../../entities/brand.entity';
import { BrandStatus, CampaignStatus, DiscountType, VoucherType } from '../../common/enums/status.enum';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { NotificationService } from '../notification/notification.service';

// FR-CAMP-12: truong gia tri bat buoc theo loai voucher
export interface ValueFields {
  voucherType?: VoucherType;
  salePrice?: number | string;
  faceValue?: number | string;
  discountType?: DiscountType | null;
  discountValue?: number | string | null;
  maxDiscount?: number | string | null;
  comboItems?: string | null;
}

export function validateValueFields(dto: ValueFields) {
  const salePrice = Number(dto.salePrice);
  const faceValue = Number(dto.faceValue);
  if (dto.voucherType === VoucherType.DISCOUNT) {
    if (!dto.discountType || !dto.discountValue) {
      throw new BadRequestException('Mã giảm giá cần kiểu giảm (số tiền / phần trăm) và giá trị giảm.');
    }
    if (dto.discountType === DiscountType.PERCENT && (Number(dto.discountValue) > 100 || !dto.maxDiscount)) {
      throw new BadRequestException('Giảm theo phần trăm cần giá trị từ 1 đến 100 và mức giảm tối đa.');
    }
  }
  if (dto.voucherType === VoucherType.PREPAID && faceValue <= salePrice) {
    throw new BadRequestException('Voucher mệnh giá phải có giá trị lớn hơn giá bán.');
  }
  if (dto.voucherType === VoucherType.COMBO && !dto.comboItems) {
    throw new BadRequestException('Combo cần mô tả nội dung gói.');
  }
}

// BR-21 / DC-10 / FR-CAMP-13: han su dung voucher phai cach ngay ket thuc ban it nhat 10 ngay,
// de moi khach mua o ngay cuoi cung van con du cua so hoan tien (BR-05).
export const MIN_EXPIRE_DAYS_AFTER_SALE_END = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineFields {
  saleStartAt?: Date | string;
  saleEndAt?: Date | string;
  voucherExpireAt?: Date | string;
}

// Gia tri co the den tu DTO (chuoi ISO) hoac tu entity (Date), nen quy ve epoch truoc khi so sanh
function toTime(value?: Date | string | null): number | null {
  if (value === undefined || value === null) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function validateTimeline(fields: TimelineFields) {
  const start = toTime(fields.saleStartAt);
  const end = toTime(fields.saleEndAt);
  const expire = toTime(fields.voucherExpireAt);
  if (start === null || end === null || expire === null) {
    throw new BadRequestException('Thiếu ngày bắt đầu bán, ngày kết thúc bán hoặc hạn sử dụng voucher.');
  }
  if (start >= end) {
    throw new BadRequestException('Ngày kết thúc bán phải sau ngày bắt đầu bán.');
  }
  if (expire < end + MIN_EXPIRE_DAYS_AFTER_SALE_END * DAY_MS) {
    throw new BadRequestException(
      `Han su dung voucher phai sau ngay ket thuc ban it nhat ${MIN_EXPIRE_DAYS_AFTER_SALE_END} ngay (BR-21).`,
    );
  }
}

// FR-CAMP-15: moi chinh sua tren chien dich o cac trang thai nay dua no ve PENDING cho duyet lai
const NEEDS_REAPPROVAL: CampaignStatus[] = [
  CampaignStatus.APPROVED,
  CampaignStatus.PUBLISHED,
  CampaignStatus.SOLD_OUT,
  CampaignStatus.PAUSED,
];

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(CampaignStore)
    private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
    // F16: tuy chon de unit test cua F08 khoi tao service khong can module thong bao
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  // FR-CAMP-01..05: tao chien dich o trang thai DRAFT
  async create(brandId: string, dto: CreateCampaignDto) {
    validateValueFields(dto);
    validateTimeline(dto);
    const campaign = this.campaignRepo.create({
      brandId,
      title: dto.title,
      image: dto.image,
      description: dto.description,
      terms: dto.terms,
      voucherType: dto.voucherType,
      salePrice: dto.salePrice,
      faceValue: dto.faceValue,
      categoryId: dto.categoryId ?? null,
      discountType: dto.discountType ?? null,
      discountValue: dto.discountValue ?? null,
      maxDiscount: dto.maxDiscount ?? null,
      comboItems: dto.comboItems ?? null,
      totalQuantity: dto.totalQuantity,
      limitPerUser: dto.limitPerUser ?? 5,
      saleStartAt: new Date(dto.saleStartAt),
      saleEndAt: new Date(dto.saleEndAt),
      voucherExpireAt: new Date(dto.voucherExpireAt),
      status: CampaignStatus.DRAFT,
    });
    const saved = await this.campaignRepo.save(campaign);

    const links = dto.storeIds.map((storeId) =>
      this.campaignStoreRepo.create({ campaignId: saved.id, storeId }),
    );
    await this.campaignStoreRepo.save(links);
    return saved;
  }

  findByBrand(brandId: string) {
    return this.campaignRepo.find({ where: { brandId } });
  }

  async findOneOrFail(id: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    return campaign;
  }

  // FR-CAMP-06, FR-CAMP-14, BR-26: gui duyet
  async submitForApproval(id: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể gửi duyệt chiến dịch ở trạng thái nháp.');
    }
    // BR-26: thuong hieu chua duoc duyet hoac dang bi dinh chi khong duoc gui duyet chien dich
    const brand = await this.brandRepo.findOne({ where: { id: campaign.brandId } });
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    if (brand.status !== BrandStatus.APPROVED) {
      throw new BadRequestException(
        'Thuong hieu chua duoc duyet hoac dang bi dinh chi nen khong the gui duyet chien dich (BR-26).',
      );
    }
    // Kiem lai truoc khi vao hang cho: chien dich co the da duoc tao tu lau va khong con hop le
    validateValueFields(campaign);
    validateTimeline(campaign);

    campaign.status = CampaignStatus.PENDING;
    campaign.submittedAt = new Date();
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-14: thuong hieu rut chien dich ve nhap de sua roi gui lai
  async withdraw(id: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể rút về nháp chiến dịch đang chờ duyệt.');
    }
    campaign.status = CampaignStatus.DRAFT;
    campaign.submittedAt = null;
    return this.campaignRepo.save(campaign);
  }

  // UC-04, FR-CAMP-07: quan tri vien duyet -> tu dong phat hanh khi toi ngay ban
  async approve(id: string, adminUserId: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể duyệt chiến dịch đang chờ duyệt.');
    }
    // UC-04 luong 3b: vi pham rang buoc ngay hoac gia tri thi khong cho duyet,
    // quan tri vien phai tu choi kem ly do de thuong hieu sua lai
    validateValueFields(campaign);
    validateTimeline(campaign);

    campaign.status = CampaignStatus.APPROVED;
    campaign.approvedBy = adminUserId;
    campaign.approvedAt = new Date();
    const saved = await this.campaignRepo.save(campaign);

    // FR-CAMP-07 / FR-CAMP-10: duyet xong ma da toi ngay ban thi phat hanh ngay, khong bat thuong hieu
    // doi het mot luot 5 phut cua tac vu nen. Goi lai runStatusTransitions de luat chuyen trang thai
    // chi nam o mot cho duy nhat.
    await this.runStatusTransitions(new Date(), saved.id);
    return this.findOneOrFail(saved.id);
  }

  // UC-04 luong 3a: tu choi -> ve DRAFT kem ly do de thuong hieu sua roi gui lai.
  // Ly do bat buoc, kiem o RejectCampaignDto.
  async reject(id: string, reason: string) {
    const campaign = await this.findOneOrFail(id);
    // Doi xung voi approve(): chi chien dich dang cho duyet moi tu choi duoc. Thieu buoc nay thi
    // mot chien dich dang ban bi bam nham "tu choi" se roi thang ve DRAFT, bien mat khoi app.
    if (campaign.status !== CampaignStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể từ chối chiến dịch đang chờ duyệt.');
    }
    campaign.status = CampaignStatus.DRAFT;
    campaign.submittedAt = null;
    campaign.rejectReason = reason.trim();
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-15: mo lai chien dich da ket thuc. Tac vu nen chuyen ENDED khi het thoi gian ban va
  // NEEDS_REAPPROVAL khong co ENDED, nen truoc day ket thuc la het duong quay lai: sua ngay xong
  // chien dich van ENDED, khong ban lai duoc, thuong hieu phai tao lai tu dau.
  // Dua ve DRAFT (khong phai PUBLISHED) de thuong hieu con phai sua lai ngay ban roi gui duyet lai.
  async reopen(id: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.ENDED) {
      throw new BadRequestException('Chỉ có thể mở lại chiến dịch đã kết thúc.');
    }
    const brand = await this.brandRepo.findOne({ where: { id: campaign.brandId } });
    // BR-26: thuong hieu chua duyet hoac dang bi dinh chi thi khong duoc dua chien dich tro lai
    if (brand?.status !== BrandStatus.APPROVED) {
      throw new BadRequestException('Thương hiệu chưa được duyệt hoặc đang bị đình chỉ, không thể mở lại chiến dịch.');
    }
    campaign.status = CampaignStatus.DRAFT;
    campaign.submittedAt = null;
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-08
  async pause(id: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.PUBLISHED) {
      throw new BadRequestException('Chỉ có thể tạm dừng chiến dịch đang bán.');
    }
    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepo.save(campaign);
  }

  async resume(id: string) {
    const campaign = await this.findOneOrFail(id);
    // Khong cho mo lai tu DRAFT / ENDED: lam vay se dua chien dich chua duyet len ban cong khai (NFR-SEC-03)
    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException('Chỉ có thể mở lại chiến dịch đang tạm dừng.');
    }
    // FR-BRAND-09: thuong hieu dang bi dinh chi thi khong duoc mo ban lai
    const brand = await this.brandRepo.findOne({ where: { id: campaign.brandId } });
    if (brand?.status === BrandStatus.SUSPENDED) {
      throw new BadRequestException('Thương hiệu đang bị đình chỉ, không thể mở bán lại chiến dịch.');
    }
    campaign.status = CampaignStatus.PUBLISHED;
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-14 (khoa sua khi cho duyet), BR-17 (khoa truong gia tri khi da ban), FR-CAMP-15 (duyet lai)
  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOneOrFail(id);

    // FR-CAMP-14: chien dich dang cho duyet bi khoa, phai rut ve nhap moi sua duoc
    if (campaign.status === CampaignStatus.PENDING) {
      throw new BadRequestException(
        'Chien dich dang cho duyet khong sua duoc. Hay rut ve nhap roi sua lai (FR-CAMP-14).',
      );
    }

    // BR-17: da ban duoc it nhat mot voucher thi khoa gia ban, cac truong gia tri, loai voucher va han su dung
    if (campaign.soldQuantity > 0) {
      const lockedFields: (keyof UpdateCampaignDto)[] = [
        'salePrice',
        'faceValue',
        'voucherExpireAt',
        'voucherType',
        'discountType',
        'discountValue',
      ];
      for (const field of lockedFields) {
        if (dto[field] !== undefined) {
          throw new BadRequestException(
            'Khong the sua gia ban, cac truong gia tri, loai voucher hoac han su dung cua chien dich da ban duoc voucher (BR-17).',
          );
        }
      }
    }

    // dto chi gui mot phan (PartialType) nen phai kiem tren du lieu sau khi gop voi ban ghi hien tai
    const merged = { ...campaign, ...dto };
    validateValueFields(merged);
    validateTimeline(merged);

    Object.assign(campaign, dto);
    // dto gui ngay duoi dang chuoi ISO (@IsDateString) con cot entity la Date, phai ep kieu nhu create()
    if (dto.saleStartAt !== undefined) campaign.saleStartAt = new Date(dto.saleStartAt);
    if (dto.saleEndAt !== undefined) campaign.saleEndAt = new Date(dto.saleEndAt);
    if (dto.voucherExpireAt !== undefined) campaign.voucherExpireAt = new Date(dto.voucherExpireAt);

    // FR-CAMP-15: sua chien dich da duyet thi phai duyet lai, tam ngung hien thi; voucher da ban khong bi anh huong
    if (NEEDS_REAPPROVAL.includes(campaign.status)) {
      campaign.status = CampaignStatus.PENDING;
      campaign.submittedAt = new Date();
    }

    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-11: ton kho con lai theo thoi gian thuc
  async remainingStock(id: string) {
    const campaign = await this.findOneOrFail(id);
    return {
      totalQuantity: campaign.totalQuantity,
      soldQuantity: campaign.soldQuantity,
      reservedQuantity: campaign.reservedQuantity,
      remaining: campaign.totalQuantity - campaign.soldQuantity - campaign.reservedQuantity,
    };
  }

  // Boc ten cot theo he quan tri CSDL dang chay: PostgreSQL dung dau nhay kep, MySQL dung dau huyen
  private readonly col = (name: string) => this.campaignRepo.manager.connection.driver.escape(name);

  // FR-CAMP-10 / BR-08: cac buoc chuyen trang thai tu dong cua chien dich, dung chung cho tac vu nen
  // (CampaignScheduler, 5 phut mot luot) va cho luc duyet xong.
  //
  // BR-25: moc "ngay ban" da nam san trong saleStartAt / saleEndAt duoi dang moc thoi gian tuyet doi
  // (luu UTC - CON-05, thuong hieu nhap theo gio VN), nen so sanh voi thoi diem hien tai cho cung ket qua
  // du may chu chay o mui gio nao. Dieu bat buoc phai tranh la dung lich cuc bo cua may chu de dung lai
  // moc ngay (kieu new Date(nam, thang, ngay)) - may chu Render chay UTC nen se lech 7 gio.
  //
  // Job CHI duoc doi cot status: soldQuantity / reservedQuantity do F09 (mua hang) va F12 (hoan tien) giu,
  // ghi de o day se lam sai ton kho.
  async runStatusTransitions(now: Date = new Date(), campaignId?: string) {
    const col = this.col;
    // Ton kho kha dung - DC-03
    const available = `${col('totalQuantity')} - ${col('soldQuantity')} - ${col('reservedQuantity')}`;
    const stillSelling = `${col('saleEndAt')} > :now`;

    // Thu tu 4 buoc duoi day co y nghia: chien dich vua phat hanh o buoc 1 ma da het hang se duoc buoc 2
    // bat ngay trong cung mot luot, khong phai doi them 5 phut.

    // F16: ghi nho chien dich sap duoc phat hanh de bao cho nguoi theo doi thuong hieu sau khi doi trang thai
    const toPublish = this.notifications
      ? await this.campaignRepo.find({
          select: ['id'],
          where: {
            status: CampaignStatus.APPROVED,
            saleStartAt: LessThanOrEqual(now),
            saleEndAt: MoreThan(now),
            ...(campaignId ? { id: campaignId } : {}),
          },
        })
      : [];

    // 1. APPROVED -> PUBLISHED khi toi ngay bat dau ban va van con thoi gian ban (FR-CAMP-07)
    const published = await this.transition([CampaignStatus.APPROVED], CampaignStatus.PUBLISHED, campaignId)
      .andWhere(`${col('saleStartAt')} <= :now`)
      .andWhere(stillSelling)
      .setParameter('now', now)
      .execute();

    // 2. Ton kho kha dung ve 0 -> SOLD_OUT. Khong dong vao PAUSED: tam dung la quyet dinh cua thuong hieu,
    //    job khong duoc tu y doi (FR-CAMP-08).
    const soldOut = await this.transition([CampaignStatus.PUBLISHED], CampaignStatus.SOLD_OUT, campaignId)
      .andWhere(`${available} <= 0`)
      .andWhere(stillSelling)
      .setParameter('now', now)
      .execute();

    // 3. Nha giu cho (don qua han - F09) hoac cong tra hang khi hoan tien (F12) ma con thoi gian ban
    //    -> quay lai PUBLISHED
    const restocked = await this.transition([CampaignStatus.SOLD_OUT], CampaignStatus.PUBLISHED, campaignId)
      .andWhere(`${available} > 0`)
      .andWhere(stillSelling)
      .setParameter('now', now)
      .execute();

    // 4. Het thoi gian ban -> ENDED. APPROVED khong vao day: chien dich duyet roi ma lo mat cua so ban
    //    van sua lai ngay duoc (sua xong ve PENDING - FR-CAMP-15), con ENDED thi het duong quay lai.
    const ended = await this.transition(
      [CampaignStatus.PUBLISHED, CampaignStatus.PAUSED, CampaignStatus.SOLD_OUT],
      CampaignStatus.ENDED,
      campaignId,
    )
      .andWhere(`${col('saleEndAt')} <= :now`)
      .setParameter('now', now)
      .execute();

    await this.notifyFollowers(toPublish.map((c) => c.id));

    return {
      published: published.affected ?? 0,
      soldOut: soldOut.affected ?? 0,
      restocked: restocked.affected ?? 0,
      ended: ended.affected ?? 0,
    };
  }

  // UPDATE ... SET status = :to WHERE status IN (:...from): mot cau lenh duy nhat nen khong co khe doc - ghi
  // voi luong mua hang chay song song (F09 khoa chien dich bang SELECT ... FOR UPDATE).
  private transition(from: CampaignStatus[], to: CampaignStatus, campaignId?: string) {
    const col = this.col;
    const qb = this.campaignRepo
      .createQueryBuilder()
      .update(VoucherCampaign)
      .set({ status: to })
      .where(`${col('status')} IN (:...from)`, { from });
    // Duyet xong thi chi ra soat dung chien dich vua duyet
    if (campaignId) qb.andWhere(`${col('id')} = :campaignId`, { campaignId });
    return qb;
  }

  // F16 (FR-BRAND-07): chien dich vua PUBLISHED -> thong bao cho khach theo doi thuong hieu (chong gui trung theo dedupeKey).
  // Loi gui thong bao khong duoc lam hong luot ra soat trang thai.
  private async notifyFollowers(ids: string[]) {
    if (!this.notifications || ids.length === 0) return;
    const campaigns = await this.campaignRepo.find({ where: { id: In(ids), status: CampaignStatus.PUBLISHED }, relations: ['brand'] });
    for (const c of campaigns) {
      try {
        await this.notifications.campaignPublished(c, c.brand?.name ?? 'Thương hiệu bạn theo dõi');
      } catch (error) {
        this.logger.warn(`Khong gui duoc thong bao chien dich moi ${c.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  findPendingApproval() {
    return this.campaignRepo.find({ where: { status: CampaignStatus.PENDING } });
  }
}
