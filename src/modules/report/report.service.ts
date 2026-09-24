import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Order } from '../../entities/order.entity';
import { Brand } from '../../entities/brand.entity';
import { Settlement } from '../../entities/settlement.entity';
import { CampaignStatus, VoucherItemStatus, BrandStatus } from '../../common/enums/status.enum';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Settlement) private readonly settlementRepo: Repository<Settlement>,
  ) {}

  // FR-REPORT-01/02: bao cao cho thuong hieu
  async brandReport(brandId: string, campaignId?: string, from?: Date, to?: Date) {
    const qb = this.campaignRepo
      .createQueryBuilder('c')
      .where('c.brandId = :brandId', { brandId });
    if (campaignId) qb.andWhere('c.id = :campaignId', { campaignId });
    if (from) qb.andWhere('c.createdAt >= :from', { from });
    if (to) qb.andWhere('c.createdAt <= :to', { to });
    const campaigns = await qb.getMany();

    const soldCount = campaigns.reduce((s, c) => s + c.soldQuantity, 0);
    const revenue = campaigns.reduce((s, c) => s + c.soldQuantity * Number(c.salePrice), 0);

    // TODO: tinh so voucher da su dung / het han bang truy van VoucherItem theo campaignIds
    return {
      totalCampaigns: campaigns.length,
      totalVoucherSold: soldCount,
      totalRevenue: revenue,
      // tyLeSuDung, soVoucherHetHan: TODO
    };
  }

  // FR-REPORT-03: bang dieu khien tong cho quan tri vien
  async adminDashboard() {
    const [totalRevenueRow] = await this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.totalAmount), 0)', 'total')
      .where("o.status IN ('FULFILLED')")
      .getRawMany();

    const [totalCommissionRow] = await this.settlementRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.commissionAmount), 0)', 'total')
      .getRawMany();

    const totalActiveBrands = await this.brandRepo.count({ where: { status: BrandStatus.APPROVED } });

    return {
      totalRevenue: Number(totalRevenueRow?.total || 0),
      totalCommission: Number(totalCommissionRow?.total || 0),
      totalActiveBrands,
      // soGiaoDichTheoNgay: TODO - group by ngay
    };
  }

  // FR-REPORT-04
  pendingCampaigns() {
    return this.campaignRepo.find({ where: { status: CampaignStatus.PENDING } });
  }

  pendingBrands() {
    return this.brandRepo.find({ where: { status: BrandStatus.PENDING } });
  }
}
