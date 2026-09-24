import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Brand } from '../../entities/brand.entity';
import { Order } from '../../entities/order.entity';
import { OrderStatus, SettlementStatus } from '../../common/enums/status.enum';
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
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
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
    const commissionRate = await this.getCommissionRate();
    const createdSettlements: Settlement[] = [];

    for (const brand of brands) {
      // FR-SETTLE-04: chi lay don hang da het quyen hoan tien (qua REFUND_WINDOW_DAYS) tinh den thoi diem chot,
      // chua nam trong bat ky ky doi soat nao truoc do (DC-06). Query duoi day la khung don gian hoa cho scaffold.
      const eligibleOrders = await this.orderRepo
        .createQueryBuilder('o')
        .innerJoin('voucher_campaigns', 'c', 'c.id = o."campaignId"')
        .where('c."brandId" = :brandId', { brandId: brand.id })
        .andWhere('o.status = :status', { status: OrderStatus.FULFILLED })
        .andWhere('o."paidAt" BETWEEN :start AND :end', { start: periodStart, end: periodEnd })
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM settlement_items si WHERE si."orderId" = o.id)`,
        )
        .getMany();

      if (eligibleOrders.length === 0) continue; // khong sinh phieu neu khong phat sinh doanh thu

      const grossRevenue = eligibleOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
      const commissionAmount = Math.round(grossRevenue * commissionRate);
      const payableAmount = grossRevenue - commissionAmount;

      const settlement = await this.settlementRepo.save(
        this.settlementRepo.create({
          brandId: brand.id,
          periodStart,
          periodEnd,
          grossRevenue,
          commissionRate,
          commissionAmount,
          payableAmount,
          status: SettlementStatus.PENDING,
        }),
      );

      const items = eligibleOrders.map((order) =>
        this.settlementItemRepo.create({
          settlementId: settlement.id,
          orderId: order.id,
          amount: order.totalAmount,
          commissionAmount: Math.round(Number(order.totalAmount) * commissionRate),
        }),
      );
      await this.settlementItemRepo.save(items);
      createdSettlements.push(settlement);
    }

    return createdSettlements;
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
