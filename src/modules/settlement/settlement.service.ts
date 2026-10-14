import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Brand } from '../../entities/brand.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { OrderStatus, SettlementStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { SetCommissionDto } from './dto/set-commission.dto';

const COMMISSION_RATE_KEY = 'commission_rate';

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(SettlementItem)
    private readonly settlementItemRepo: Repository<SettlementItem>,
    @InjectRepository(SystemConfig) private readonly configRepo: Repository<SystemConfig>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
  ) {}

  // FR-SETTLE-01, BR-09
  async setCommissionRate(dto: SetCommissionDto, updatedBy: string) {
    await this.configRepo.save({
      key: COMMISSION_RATE_KEY,
      value: dto.rate.toString(),
      updatedBy,
    });
    return { message: 'Da cap nhat ty le hoa hong.', rate: dto.rate };
  }

  async getCommissionRate(): Promise<number> {
    const config = await this.configRepo.findOne({ where: { key: COMMISSION_RATE_KEY } });
    return config ? parseFloat(config.value) : parseFloat(process.env.DEFAULT_COMMISSION_RATE || '0.1');
  }

  // UC-05, FR-SETTLE-02..08, BR-09, BR-14, BR-15
  // TODO: lich chay dinh ky dau thang qua @nestjs/schedule Cron (xem settlement.scheduler.ts)
  async runMonthlySettlement(periodStart: Date, periodEnd: Date) {
    const brands = await this.brandRepo.find();
    const currentRate = await this.getCommissionRate();
    const createdSettlements: Settlement[] = [];

    for (const brand of brands) {
      // BR-14: chi lay voucher da het quyen hoan tien tai thoi diem chot, khong dang hoan / da hoan,
      // va chua thuoc phieu doi soat nao (DC-06). BR-15: voucher het han khong dung van tinh doanh thu.
      const items = await this.voucherItemRepo
        .createQueryBuilder('v')
        .innerJoinAndSelect('v.order', 'o')
        .innerJoin(VoucherCampaign, 'c', 'c.id = v.campaignId')
        .where('c.brandId = :brandId', { brandId: brand.id })
        .andWhere('o.status = :fulfilled', { fulfilled: OrderStatus.FULFILLED })
        .andWhere('v.status IN (:...statuses)', {
          statuses: [VoucherItemStatus.ACTIVE, VoucherItemStatus.USED, VoucherItemStatus.EXPIRED],
        })
        .andWhere('v.refundableUntil <= :end', { end: periodEnd })
        // chua thuoc phieu nao: LEFT JOIN ... IS NULL chay giong nhau tren PostgreSQL va MySQL
        .leftJoin(SettlementItem, 'si', 'si.voucherItemId = v.id')
        .andWhere('si.id IS NULL')
        .getMany();

      if (items.length === 0) continue; // khong sinh phieu neu khong phat sinh doanh thu

      // BR-09: dung ty le da chot vao don; don cu chua co thi dung ty le hien hanh
      const lines = items.map((v) => {
        const amount = Number(v.order.unitPrice);
        const rate = v.order.commissionRate != null ? Number(v.order.commissionRate) : currentRate;
        return { v, amount, rate, commission: Math.round(amount * rate) };
      });
      const grossRevenue = lines.reduce((sum, l) => sum + l.amount, 0);
      const commissionAmount = lines.reduce((sum, l) => sum + l.commission, 0);

      const settlement = await this.settlementRepo.save(
        this.settlementRepo.create({
          brandId: brand.id,
          periodStart,
          periodEnd,
          voucherCount: lines.length,
          grossRevenue,
          commissionAmount,
          payableAmount: grossRevenue - commissionAmount,
          status: SettlementStatus.PENDING,
        }),
      );

      await this.settlementItemRepo.save(
        lines.map((l) =>
          this.settlementItemRepo.create({
            settlementId: settlement.id,
            voucherItemId: l.v.id,
            orderId: l.v.orderId,
            amount: l.amount,
            commissionRate: l.rate,
            commissionAmount: l.commission,
          }),
        ),
      );
      createdSettlements.push(settlement);
    }

    return createdSettlements;
  }

  // FR-SETTLE-07: quan tri vien xem tat ca phieu doi soat de chi tra
  async findAll() {
    const settlements = await this.settlementRepo.find({
      relations: ['brand'],
      order: { periodStart: 'DESC' },
    });
    return settlements.map(({ brand, ...s }) => ({ ...s, brandName: brand?.name }));
  }

  findByBrand(brandId: string) {
    return this.settlementRepo.find({ where: { brandId }, order: { periodStart: 'DESC' } });
  }

  async findOneOrFail(id: string) {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Khong tim thay phieu doi soat.');
    return settlement;
  }

  // FR-SETTLE-07: quan tri vien danh dau da chi tra kem ma giao dich
  async markPaid(id: string, bankTxnRef: string) {
    const settlement = await this.findOneOrFail(id);
    if (settlement.status === SettlementStatus.PAID) {
      throw new BadRequestException('Phieu doi soat da duoc chi tra.');
    }
    settlement.status = SettlementStatus.PAID;
    settlement.paidAt = new Date();
    settlement.bankTxnRef = bankTxnRef;
    return this.settlementRepo.save(settlement);
  }

  async detail(id: string) {
    const settlement = await this.findOneOrFail(id);
    const items = await this.settlementItemRepo.find({ where: { settlementId: id } });
    return { settlement, items };
  }
}
