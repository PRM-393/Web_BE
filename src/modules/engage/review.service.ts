import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Review } from '../../entities/review.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { User } from '../../entities/user.entity';
import { ReviewStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PaginationQueryDto, skipTake, toPage } from '../../common/dto/pagination.dto';
import { AdminReviewQueryDto, CreateReviewDto } from './dto/create-review.dto';

const NOT_ELIGIBLE = 'Bạn cần sử dụng ít nhất một voucher của chiến dịch này trước khi đánh giá (BR-10).';

// Ten nguoi danh gia hien cong khai: "Trần Gia Hân" -> "Hân T.", khong lo ho ten day du / email
export function reviewerName(user?: Pick<User, 'fullName' | 'email'> | null): string {
  const words = user?.fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[words.length - 1]} ${words[0][0]}.`;
  if (words.length === 1) return words[0];
  const local = user?.email?.split('@')[0] ?? '';
  return local ? `${local.slice(0, 2)}***` : 'Khách hàng';
}

// F15 - danh gia chien dich (FR-ENGAGE-02..05, BR-10, DC-09)
@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    private readonly dataSource: DataSource,
  ) {}

  // BR-10: khach co it nhat 1 voucher USED cua chien dich; DC-09: moi khach 1 danh gia / chien dich
  async create(userId: string, dto: CreateReviewDto) {
    if (!dto.campaignId && !dto.voucherItemId) {
      throw new BadRequestException('Cần gửi chiến dịch (campaignId) cần đánh giá.');
    }
    let item: VoucherItem | null;
    if (dto.voucherItemId) {
      item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
      if (!item || item.userId !== userId) throw new NotFoundException('Không tìm thấy voucher.');
      if (dto.campaignId && dto.campaignId !== item.campaignId) {
        throw new BusinessException('REVIEW_NOT_ELIGIBLE', 'Voucher không thuộc chiến dịch này.');
      }
      if (item.status !== VoucherItemStatus.USED) throw new BusinessException('REVIEW_NOT_ELIGIBLE', NOT_ELIGIBLE);
    } else {
      item = await this.latestUsedVoucher(userId, dto.campaignId!);
      if (!item) throw new BusinessException('REVIEW_NOT_ELIGIBLE', NOT_ELIGIBLE);
    }

    if (await this.reviewRepo.findOne({ where: { userId, campaignId: item.campaignId } })) {
      throw new BusinessException('REVIEW_EXISTS', 'Bạn đã đánh giá chiến dịch này.');
    }
    try {
      return await this.reviewRepo.save(
        this.reviewRepo.create({
          campaignId: item.campaignId,
          voucherItemId: item.id,
          userId,
          rating: dto.rating,
          comment: dto.comment?.trim() || undefined,
        }),
      );
    } catch (e) {
      // Hai lan gui cung luc: rang buoc duy nhat (userId, campaignId) chan ban ghi thu hai
      if (e instanceof QueryFailedError) throw new BusinessException('REVIEW_EXISTS', 'Bạn đã đánh giá chiến dịch này.');
      throw e;
    }
  }

  // App chi hien nut "Đánh giá" khi canReview (khach chua dung voucher khong thay nut)
  async eligibility(userId: string, campaignId: string) {
    const existing = await this.reviewRepo.findOne({ where: { userId, campaignId } });
    if (existing) {
      return { canReview: false, reasonCode: 'REVIEW_EXISTS', reason: 'Bạn đã đánh giá chiến dịch này.', reviewId: existing.id };
    }
    if (!(await this.latestUsedVoucher(userId, campaignId))) {
      return { canReview: false, reasonCode: 'REVIEW_NOT_ELIGIBLE', reason: NOT_ELIGIBLE, reviewId: null };
    }
    return { canReview: true, reasonCode: null, reason: null, reviewId: null };
  }

  private latestUsedVoucher(userId: string, campaignId: string) {
    return this.voucherItemRepo.findOne({
      where: { userId, campaignId, status: VoucherItemStatus.USED },
      order: { usedAt: 'DESC' },
    });
  }

  // Danh gia cong khai cua chien dich (khach / Guest): chi VISIBLE, kem diem trung binh
  async listByCampaign(campaignId: string, q: PaginationQueryDto) {
    const page = await this.reviewRepo.findAndCount({
      where: { campaignId, status: ReviewStatus.VISIBLE },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      ...skipTake(q),
    });
    const summary = await this.summary(campaignId);
    return { ...toPage([page[0].map((r) => this.toPublic(r)), page[1]], q), ...summary };
  }

  // Diem trung binh chi tinh danh gia khong bi an
  async summary(campaignId: string) {
    const raw = await this.reviewRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.campaignId = :campaignId', { campaignId })
      .andWhere('r.status = :status', { status: ReviewStatus.VISIBLE })
      .getRawOne<{ avg: string | number | null; count: string | number }>();
    const count = Number(raw?.count ?? 0);
    return {
      avgRating: count > 0 && raw?.avg !== null && raw?.avg !== undefined ? Math.round(Number(raw.avg) * 10) / 10 : null,
      reviewCount: count,
    };
  }

  // FR-ENGAGE-04: thuong hieu phan hoi cong khai mot lan (BrandResourceGuard da kiem tra quyen so huu)
  async reply(reviewId: string, reply: string) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');
    if (review.brandReply) throw new BusinessException('REVIEW_ALREADY_REPLIED', 'Đánh giá này đã được phản hồi.');
    review.brandReply = reply.trim();
    review.brandRepliedAt = new Date();
    return this.reviewRepo.save(review);
  }

  // Portal thuong hieu: thay ca danh gia bi an (kem trang thai) de biet vi sao khong hien cong khai
  async listByBrand(brandId: string) {
    const reviews = await this.reviewRepo.find({
      where: { campaign: { brandId } },
      relations: ['campaign', 'user'],
      order: { createdAt: 'DESC' },
    });
    return reviews.map((r) => this.toBrandView(r));
  }

  // ================= Quan tri vien (FR-ENGAGE-05) =================

  async listAdmin(q: AdminReviewQueryDto) {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.campaign', 'c')
      .leftJoinAndSelect('c.brand', 'b')
      .leftJoinAndSelect('r.user', 'u')
      .orderBy('r.createdAt', 'DESC');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.brandId) qb.andWhere('c.brandId = :brandId', { brandId: q.brandId });
    const { skip, take } = skipTake(q);
    const [rows, total] = await qb.skip(skip).take(take).getManyAndCount();
    return toPage(
      [rows.map((r) => ({ ...this.toBrandView(r), brandId: r.campaign?.brandId ?? null, brandName: r.campaign?.brand?.name ?? null })), total],
      q,
    );
  }

  async hide(reviewId: string, actorUserId: string, reason: string) {
    return this.setStatus(reviewId, actorUserId, ReviewStatus.HIDDEN, 'HIDE_REVIEW', reason.trim());
  }

  async unhide(reviewId: string, actorUserId: string) {
    return this.setStatus(reviewId, actorUserId, ReviewStatus.VISIBLE, 'UNHIDE_REVIEW', null);
  }

  private async setStatus(reviewId: string, actorUserId: string, status: ReviewStatus, action: string, reason: string | null) {
    const saved = await this.dataSource.transaction(async (manager) => {
      const review = await manager.findOne(Review, { where: { id: reviewId }, lock: { mode: 'pessimistic_write' } });
      if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');
      if (review.status === status) {
        throw new BusinessException(
          'REVIEW_STATUS_UNCHANGED',
          status === ReviewStatus.HIDDEN ? 'Đánh giá đã bị ẩn trước đó.' : 'Đánh giá đang hiển thị.',
        );
      }
      review.status = status;
      await manager.save(review);
      await manager.save(
        AuditLog,
        manager.create(AuditLog, { actorUserId, action, entityType: 'Review', entityId: reviewId, detail: reason ? { reason } : null }),
      );
      return review;
    });
    const full = await this.reviewRepo.findOneOrFail({ where: { id: saved.id }, relations: ['campaign', 'user'] });
    return { ...this.toBrandView(full), ...(await this.summary(full.campaignId)) };
  }

  private toPublic(r: Review) {
    return {
      id: r.id,
      campaignId: r.campaignId,
      rating: r.rating,
      comment: r.comment ?? null,
      brandReply: r.brandReply ?? null,
      brandRepliedAt: r.brandRepliedAt ?? null,
      createdAt: r.createdAt,
      reviewerName: reviewerName(r.user),
    };
  }

  private toBrandView(r: Review) {
    return {
      ...this.toPublic(r),
      voucherItemId: r.voucherItemId,
      campaignTitle: r.campaign?.title ?? null,
      status: r.status,
    };
  }
}
