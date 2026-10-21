import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { RefundRequest } from '../../entities/refund-request.entity';
import { Review } from '../../entities/review.entity';
import { VoucherItemStatus } from '../../common/enums/status.enum';
import { OPEN_REFUND_STATUSES, refundEligibility } from '../refund/refund.rules';
import { WalletTab, walletPlacement } from './wallet.rules';

// F10 - vi voucher cua khach (FR-REDEEM-01): chia 4 tab, chi tiet voucher da mua, chi chu so huu xem duoc.
// Tra kem dieu kien hoan tien (FR-REFUND-04/07) va danh gia (BR-10) de app khoa / hien nut dung luc.
@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(CampaignStore) private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(RedemptionLog) private readonly logRepo: Repository<RedemptionLog>,
    @InjectRepository(RefundRequest) private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
  ) {}

  async list(userId: string, tab?: WalletTab) {
    const items = await this.voucherItemRepo.find({
      where: { userId },
      relations: ['campaign', 'campaign.brand'],
      order: { issuedAt: 'DESC' },
    });
    const [openRefunds, reviews] = await Promise.all([
      this.refundRepo.find({ where: { userId, status: In(OPEN_REFUND_STATUSES) }, select: ['id', 'voucherItemId'] }),
      this.reviewRepo.find({ where: { userId }, select: ['id', 'campaignId'] }),
    ]);
    const open = new Set(openRefunds.map((r) => r.voucherItemId));
    const reviewed = new Set(reviews.map((r) => r.campaignId));
    const now = new Date();
    const views = items.map((item) => this.toView(item, now, open.has(item.id), reviewed.has(item.campaignId)));
    return tab ? views.filter((v) => v.tab === tab) : views;
  }

  async detail(userId: string, id: string) {
    const item = await this.voucherItemRepo.findOne({ where: { id }, relations: ['campaign', 'campaign.brand'] });
    // Voucher cua nguoi khac tra 404 nhu khong ton tai, khong lo su ton tai cua voucher
    if (!item || item.userId !== userId) throw new NotFoundException('Không tìm thấy voucher.');

    const [campaignStores, redemption, refunds, review] = await Promise.all([
      this.campaignStoreRepo.find({ where: { campaignId: item.campaignId }, relations: ['store'] }),
      this.logRepo.findOne({ where: { voucherItemId: item.id }, relations: ['store'] }),
      this.refundRepo.find({ where: { voucherItemId: item.id }, relations: ['paymentRefund'], order: { createdAt: 'DESC' } }),
      this.reviewRepo.findOne({ where: { userId, campaignId: item.campaignId } }),
    ]);
    const hasOpenRefund = refunds.some((r) => OPEN_REFUND_STATUSES.includes(r.status));

    return {
      ...this.toView(item, new Date(), hasOpenRefund, !!review),
      stores: campaignStores
        .filter((cs) => cs.store && cs.store.status !== false)
        .map((cs) => ({
          id: cs.store.id,
          name: cs.store.name,
          address: cs.store.address,
          latitude: cs.store.latitude,
          longitude: cs.store.longitude,
          phone: cs.store.phone ?? null,
          openingHours: cs.store.openingHours ?? null,
        })),
      redemption: redemption
        ? {
            redeemedAt: redemption.redeemedAt,
            storeId: redemption.storeId,
            storeName: redemption.store?.name ?? null,
            storeAddress: redemption.store?.address ?? null,
            method: redemption.method,
            billAmount: redemption.billAmount === null || redemption.billAmount === undefined ? null : Number(redemption.billAmount),
          }
        : null,
      refundRequests: refunds.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason ?? null,
        rejectReason: r.rejectReason ?? null,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt ?? null,
        gatewayRefundId: r.paymentRefund?.gatewayRefundId ?? null,
      })),
      reviewId: review?.id ?? null,
    };
  }

  private toView(item: VoucherItem, now: Date, hasOpenRefund: boolean, hasReviewed: boolean) {
    const { secretKey: _secretKey, campaign, ...rest } = item;
    const placement = walletPlacement(item, now);
    const refund = refundEligibility(item, hasOpenRefund, now);
    const brand = campaign?.brand;
    return {
      ...rest,
      ...placement,
      // Chi voucher dang hieu luc (khong dang cho hoan) moi sinh ma su dung duoc
      canRedeem: placement.tab === 'ACTIVE' && placement.displayStatus === VoucherItemStatus.ACTIVE,
      refund,
      review: {
        hasReviewed,
        // BR-10: da dung it nhat 1 voucher cua chien dich va chua danh gia chien dich nay
        canReview: item.status === VoucherItemStatus.USED && !hasReviewed,
      },
      campaign: campaign
        ? {
            ...this.withoutBrand(campaign),
            brand: brand ? { id: brand.id, name: brand.name, logo: brand.logo ?? null } : null,
          }
        : null,
    };
  }

  // Bo thong tin noi bo cua thuong hieu (tai khoan ngan hang, lien he) khoi vi khach
  private withoutBrand(campaign: VoucherItem['campaign']) {
    const { brand: _brand, ...rest } = campaign;
    return rest;
  }
}
