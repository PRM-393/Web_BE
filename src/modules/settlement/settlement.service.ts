import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Brand } from '../../entities/brand.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { OrderStatus, SettlementStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { SetCommissionDto } from './dto/set-commission.dto';

// Khoa cau hinh dung chung voi F09: order.service doc cung key nay luc thanh toan de chot ty le vao don
export const COMMISSION_RATE_KEY = 'commission_rate';

// Ty le dung tam khi chua ai cau hinh, hoac ban ghi cau hinh bi hong
export const DEFAULT_COMMISSION_RATE = 0.1;

// FR-SETTLE-01 / BR-09: ty le hoa hong phai nam trong khoang mo 0 < rate < 1.
// Bang 0 thi san khong thu duoc dong nao, bang 1 thi thuong hieu khong nhan duoc gi;
// ca hai deu lam phieu doi soat vo nghia nen chan ngay tu luc cau hinh.
export function validateCommissionRate(rate: unknown): number {
  const value = typeof rate === 'string' ? Number(rate) : rate;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException('Ty le hoa hong phai la mot so. Vi du nhap 0.1 de thu 10%.');
  }
  if (value <= 0 || value >= 1) {
    throw new BadRequestException(
      'Ty le hoa hong phai lon hon 0 va nho hon 1, tuong duong lon hon 0% va nho hon 100%. ' +
        'Vi du nhap 0.1 de thu 10%.',
    );
  }
  return value;
}

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(Settlement) private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(SettlementItem)
    private readonly settlementItemRepo: Repository<SettlementItem>,
    @InjectRepository(SystemConfig) private readonly configRepo: Repository<SystemConfig>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  // FR-SETTLE-01, BR-09: doi ty le hoa hong chung cua san.
  // Khong dong gi vao don cu: order.service chot Order.commissionRate ngay luc thanh toan,
  // nen ty le moi chi an sang nhung don thanh toan sau thoi diem nay.
  async setCommissionRate(dto: SetCommissionDto, updatedBy: string) {
    const rate = validateCommissionRate(dto.rate);
    const previousRate = await this.readStoredCommissionRate();

    await this.configRepo.save({
      key: COMMISSION_RATE_KEY,
      value: rate.toString(),
      updatedBy,
    });

    // NFR-SEC-07: ghi nhat ky kiem toan kem nguoi thuc hien, gia tri cu va gia tri moi
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        actorUserId: updatedBy ?? null,
        action: 'SET_COMMISSION_RATE',
        entityType: 'SystemConfig',
        entityId: COMMISSION_RATE_KEY,
        detail: { previousRate, newRate: rate },
      }),
    );

    return { message: 'Da cap nhat ty le hoa hong.', rate };
  }

  async getCommissionRate(): Promise<number> {
    const stored = await this.readStoredCommissionRate();
    return stored ?? this.fallbackCommissionRate();
  }

  // FR-SETTLE-01: kem nguoi sua va thoi diem sua de man quan tri hien duoc lan thay doi gan nhat
  async getCommissionRateInfo() {
    const config = await this.configRepo.findOne({ where: { key: COMMISSION_RATE_KEY } });
    const stored = this.parseStoredRate(config?.value);
    return {
      rate: stored ?? this.fallbackCommissionRate(),
      // true khi dang chay bang ty le mac dinh vi chua ai cau hinh (hoac ban ghi hong)
      isDefault: stored === null,
      updatedBy: stored === null ? null : (config?.updatedBy ?? null),
      updatedAt: stored === null ? null : (config?.updatedAt ?? null),
    };
  }

  // Doc ban ghi cau hinh; tra null khi chua co, hoac gia tri luu bi hong / ngoai khoang hop le,
  // de mot ban ghi hong khong lam hoa hong tinh ra NaN roi lan vao phieu doi soat.
  private async readStoredCommissionRate(): Promise<number | null> {
    const config = await this.configRepo.findOne({ where: { key: COMMISSION_RATE_KEY } });
    return this.parseStoredRate(config?.value);
  }

  private parseStoredRate(value?: string | null): number | null {
    if (value === undefined || value === null) return null;
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return null;
    return rate;
  }

  private fallbackCommissionRate(): number {
    const fromEnv = Number(process.env.DEFAULT_COMMISSION_RATE);
    if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv < 1) return fromEnv;
    return DEFAULT_COMMISSION_RATE;
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
        // Het quyen hoan TAI THOI DIEM CHOT: da dung / het han, hoac da qua refundableUntil.
        // Chot giua ky (nut "chot" cua quan tri) thi moc la luc chot, khong phai cuoi ky - neu khong
        // voucher con dang trong 7 ngay hoan van bi tinh vao phieu (vi pham BR-14).
        .andWhere('(v.status IN (:...done) OR v.refundableUntil <= :cutoff)', {
          done: [VoucherItemStatus.USED, VoucherItemStatus.EXPIRED],
          cutoff: new Date(Math.min(Date.now(), periodEnd.getTime())),
        })
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
