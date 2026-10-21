import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Order } from '../../entities/order.entity';
import { Brand } from '../../entities/brand.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentRefund } from '../../entities/payment-refund.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { PaymentStatus, PaymentRefundMode, PaymentRefundReason, PaymentRefundStatus } from '../../common/enums/status.enum';
import { Store } from '../../entities/store.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { CampaignStatus, VoucherItemStatus, BrandStatus, OrderStatus } from '../../common/enums/status.enum';
import { ReportQueryDto } from './dto/report-query.dto';

export function vietnamDate(date: Date) {
  return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
export function reportRange(query: ReportQueryDto) {
  // Date-only inputs mean full calendar days in Asia/Ho_Chi_Minh.
  const parse = (value: string, end: boolean) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + (end ? 'T23:59:59.999+07:00' : 'T00:00:00.000+07:00'))
    : new Date(value);
  const from = query.from ? parse(query.from, false) : undefined;
  const to = query.to ? parse(query.to, true) : undefined;
  if (from && !Number.isFinite(from.getTime()) || to && !Number.isFinite(to.getTime()) || from && to && from > to) {
    throw new BadRequestException('Khoảng thời gian không hợp lệ.');
  }
  return { from, to };
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(VoucherCampaign) private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    private readonly db: DataSource,
  ) {}

  async brandReport(userId: string, brandId: string, query: ReportQueryDto = {}) {
    const brand = await this.brandRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    if (brand.ownerUserId !== userId) throw new ForbiddenException('Bạn không có quyền xem báo cáo thương hiệu này.');
    if (query.storeId && !await this.storeRepo.exists({ where: { id: query.storeId, brandId } })) {
      throw new BadRequestException('Chi nhánh không thuộc thương hiệu này.');
    }
    const { from, to } = reportRange(query);
    const qb = this.voucherItemRepo.createQueryBuilder('v')
      .innerJoinAndSelect('v.order', 'o').innerJoin('v.campaign', 'c')
      .where('c.brandId = :brandId', { brandId }).andWhere('o.status = :status', { status: OrderStatus.FULFILLED });
    if (query.campaignId) qb.andWhere('c.id = :campaignId', { campaignId: query.campaignId });
    if (from) qb.andWhere('o.paidAt >= :from', { from });
    if (to) qb.andWhere('o.paidAt <= :to', { to });
    // A sale has no store until redemption. Branch reports contain vouchers redeemed at that store.
    if (query.storeId) qb.innerJoin(RedemptionLog, 'log', 'log.voucherItemId = v.id AND log.storeId = :storeId', { storeId: query.storeId });
    const items = await qb.getMany();
    const now = new Date();
    const used = items.filter(v => v.status === VoucherItemStatus.USED).length;
    const expired = items.filter(v => v.status === VoucherItemStatus.EXPIRED || v.status === VoucherItemStatus.ACTIVE && v.expireAt <= now).length;
    const refunded = items.filter(v => v.status === VoucherItemStatus.REFUNDED).length;
    const grossRevenue = items.reduce((sum, v) => sum + Number(v.order.unitPrice), 0);
    const refundedAmount = items.filter(v => v.status === VoucherItemStatus.REFUNDED).reduce((sum, v) => sum + Number(v.order.unitPrice), 0);
    const campaigns = this.campaignRepo.createQueryBuilder('c').where('c.brandId = :brandId', { brandId });
    if (query.campaignId) campaigns.andWhere('c.id = :id', { id: query.campaignId });
    return {
      totalCampaigns: await campaigns.getCount(), totalVoucherSold: items.length,
      grossRevenue, refundedAmount, totalRevenue: grossRevenue - refundedAmount,
      totalVoucherUsed: used, totalVoucherExpired: expired, totalVoucherRefunded: refunded,
      usageRate: items.length - refunded > 0 ? used / (items.length - refunded) * 100 : 0,
      dateBasis: 'paidAt', branchBasis: query.storeId ? 'redeemedAtStore' : null,
    };
  }

  async adminDashboard(query: ReportQueryDto = {}) {
    const { from, to } = reportRange(query);
    const qb = this.orderRepo.createQueryBuilder('o').where('o.status = :status', { status: OrderStatus.FULFILLED });
    if (from) qb.andWhere('o.paidAt >= :from', { from });
    if (to) qb.andWhere('o.paidAt <= :to', { to });
    const orders = await qb.getMany();
    const vouchers = this.voucherItemRepo.createQueryBuilder('v').innerJoinAndSelect('v.order', 'o')
      .where('o.status = :status', { status: OrderStatus.FULFILLED })
      .andWhere('v.status != :refunded', { refunded: VoucherItemStatus.REFUNDED });
    if (from) vouchers.andWhere('o.paidAt >= :from', { from });
    if (to) vouchers.andWhere('o.paidAt <= :to', { to });
    const commissionItems = await vouchers.getMany();
    const byDate = new Map<string, { date: string; count: number; revenue: number }>();
    let grossRevenue = 0, refundedAmount = 0;
    for (const o of orders) {
      grossRevenue += Number(o.totalAmount);
      refundedAmount += Number(o.refundedAmount);
      if (!o.paidAt) continue;
      const date = vietnamDate(o.paidAt);
      const row = byDate.get(date) || { date, count: 0, revenue: 0 };
      row.count++;
      row.revenue += Number(o.totalAmount) - Number(o.refundedAmount);
      byDate.set(date, row);
    }
    return {
      grossRevenue, refundedAmount, totalRevenue: grossRevenue - refundedAmount,
      totalCommission: commissionItems.reduce((sum, v) => sum + Math.round(Number(v.order.unitPrice) * Number(v.order.commissionRate || 0)), 0),
      totalActiveBrands: await this.brandRepo.count({ where: { status: BrandStatus.APPROVED } }),
      totalTransactions: orders.length,
      transactionsByDay: [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date)),
      dateBasis: 'paidAt', timezone: 'Asia/Ho_Chi_Minh',
    };
  }

  pendingCampaigns() { return this.campaignRepo.find({ where: { status: CampaignStatus.PENDING }, order: { submittedAt: 'ASC' } }); }

  async pendingBrands() {
    const brands = await this.brandRepo.find({ where: { status: BrandStatus.PENDING }, order: { createdAt: 'ASC' } });
    return brands;
  }

  async paymentMismatches() {
    const orders = await this.orderRepo.find({
      where: { status: OrderStatus.PAYMENT_MISMATCH },
      relations: ['campaign', 'user'],
      order: { createdAt: 'ASC' },
    });
    // UC-07: kem ten chien dich + khach de quan tri vien doi chieu; khong tra passwordHash / thong tin noi bo
    return Promise.all(orders.map(async ({ user, campaign, ...order }) => ({ ...order,
      campaignTitle: campaign?.title ?? null,
      customer: user ? { id: user.id, email: user.email, fullName: user.fullName ?? null, phone: user.phone ?? null } : null,
      payments: (await this.db.getRepository(Payment).find({ where: { orderId: order.id, status: PaymentStatus.SUCCESS } }))
        .map(p => ({ id: p.id, gatewayTxnId: p.gatewayTxnId, amount: Number(p.amount) })),
    })));
  }

  async confirmMismatch(orderId: string, actorUserId: string, gatewayRefundId: string) {
    return this.db.transaction(async manager => {
      const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order || order.status !== OrderStatus.PAYMENT_MISMATCH) throw new BadRequestException('Đơn không còn chờ hoàn tiền do lệch số tiền.');
      const payments = await manager.find(Payment, { where: { orderId, status: PaymentStatus.SUCCESS } });
      if (payments.length !== 1) throw new BadRequestException('Cần đối chiếu chính xác một giao dịch đã nhận trước khi xác nhận.');
      const payment = payments[0];
      const previous = await manager.find(PaymentRefund, { where: { paymentId: payment.id, status: PaymentRefundStatus.COMPLETED } });
      const remaining = Number(payment.amount) - previous.reduce((sum, p) => sum + Number(p.amount), 0);
      if (remaining <= 0) throw new BadRequestException('Giao dịch đã được hoàn hết.');
      const refund = await manager.save(PaymentRefund, manager.create(PaymentRefund, {
        paymentId: payment.id, amount: remaining, reasonType: PaymentRefundReason.MISMATCH,
        mode: PaymentRefundMode.MANUAL, status: PaymentRefundStatus.COMPLETED,
        gatewayRefundId: gatewayRefundId.trim(), processedBy: actorUserId, completedAt: new Date(),
      }));
      order.status = OrderStatus.CANCELLED;
      order.refundedAmount = Number(order.refundedAmount) + remaining;
      await manager.save(order);
      await manager.save(AuditLog, manager.create(AuditLog, { actorUserId, action: 'CONFIRM_MISMATCH_REFUND', entityType: 'Order', entityId: orderId, detail: { paymentRefundId: refund.id } }));
      return { message: 'Đã ghi nhận hoàn tiền thủ công.', paymentRefundId: refund.id };
    });
  }
}
