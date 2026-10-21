import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentRefund } from '../../entities/payment-refund.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import {
  CampaignStatus,
  OrderStatus,
  PaymentRefundMode,
  PaymentRefundReason,
  PaymentRefundStatus,
  PaymentStatus,
  VoucherItemStatus,
} from '../../common/enums/status.enum';
import { NotificationService } from '../notification/notification.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { availableStock, isOnSale, refundableUntil, remainingPurchaseQuota, voucherCode } from './order.rules';
import { PaymentResult, PayosWebhookResult, createPayosLink, newPaymentOrderCode, verifyWebhook } from './payment-gateway';

// Ket qua xu ly mot thong bao thanh toan, dung de tra loi cong va de test
export type PaymentOutcome =
  | 'DUPLICATE'
  | 'FULFILLED'
  | 'FULFILLED_LATE'
  | 'REFUNDED_OVERSOLD'
  | 'PAYMENT_MISMATCH'
  | 'CANCELLED'
  | 'IGNORED';

const RESERVATION_MINUTES = () => parseInt(process.env.ORDER_RESERVATION_TTL_MINUTES || '15', 10);

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(SystemConfig) private readonly configRepo: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  // ================= Tao don (UC-01 buoc 1-4, FR-ORDER-01..04, BR-01, BR-02, DC-03) =================
  async createOrder(userId: string, dto: CreateOrderDto) {
    const order = await this.dataSource.transaction(async (manager) => {
      // Khoa ban ghi chien dich de 2 nguoi mua voucher cuoi cung cung luc khong ban vuot
      const campaign = await this.lockCampaign(manager, dto.campaignId);
      if (campaign.status !== CampaignStatus.PUBLISHED || !isOnSale(campaign, new Date())) {
        throw new BadRequestException('Chien dich khong con dang ban.');
      }
      if (dto.quantity > availableStock(campaign)) {
        throw new BadRequestException(`Chi con ${Math.max(0, availableStock(campaign))} voucher, vui long giam so luong.`);
      }

      // BR-01: da mua (moi voucher da phat hanh) + don PENDING + so dat <= gioi han
      const issued = await manager.count(VoucherItem, { where: { userId, campaignId: campaign.id } });
      const pending = await manager.find(Order, { where: { userId, campaignId: campaign.id, status: OrderStatus.PENDING } });
      const quota = remainingPurchaseQuota(campaign.limitPerUser, issued, pending.reduce((s, o) => s + o.quantity, 0));
      if (dto.quantity > quota) {
        throw new BadRequestException(
          quota === 0
            ? `Ban da dat gioi han ${campaign.limitPerUser} voucher cho chien dich nay.`
            : `Ban chi con duoc mua toi da ${quota} voucher cho chien dich nay.`,
        );
      }

      // Lop bao ve thu hai (DC-03): cong giu cho bang mot cau UPDATE co dieu kien, nguyen tu tren moi he CSDL,
      // ke ca khi khoa dong khong co tac dung. Khong du ton kho -> 0 dong duoc cap nhat -> tu choi.
      if (!(await this.reserveStock(manager, campaign.id, dto.quantity))) {
        throw new BadRequestException('Voucher vua het, vui long chon so luong khac.');
      }
      const reserved = await manager.findOneByOrFail(VoucherCampaign, { id: campaign.id });
      if (availableStock(reserved) === 0 && reserved.status === CampaignStatus.PUBLISHED) {
        await manager.update(VoucherCampaign, reserved.id, { status: CampaignStatus.SOLD_OUT }); // SRS 6.1
      }

      const unitPrice = Number(campaign.salePrice);
      return manager.save(
        manager.create(Order, {
          userId,
          campaignId: campaign.id,
          quantity: dto.quantity,
          unitPrice,
          totalAmount: unitPrice * dto.quantity,
          status: OrderStatus.PENDING,
          paymentOrderCode: newPaymentOrderCode(),
          reservedUntil: new Date(Date.now() + RESERVATION_MINUTES() * 60 * 1000),
        }),
      );
    });
    return { order, paymentUrl: await this.ensurePaymentLink(order) };
  }

  // FR-ORDER-12: thanh toan lai don PENDING con trong thoi gian giu cho, lien ket het han dung reservedUntil
  async retryPayment(userId: string, orderId: string) {
    const order = await this.findMyOrder(userId, orderId);
    if (order.status !== OrderStatus.PENDING) throw new BadRequestException('Don hang khong con cho thanh toan.');
    if (new Date(order.reservedUntil).getTime() <= Date.now()) {
      throw new BadRequestException('Don hang da het thoi gian giu cho, vui long dat lai.');
    }
    return { order, paymentUrl: await this.ensurePaymentLink(order) };
  }

  // Tao link payOS mot lan cho moi don va luu lai; chua cau hinh payOS -> null (app dung che do gia lap thanh toan)
  private async ensurePaymentLink(order: Order): Promise<string | null> {
    if (order.paymentUrl) return order.paymentUrl;
    try {
      const url = await createPayosLink({
        orderCode: String(order.paymentOrderCode),
        amount: Number(order.totalAmount),
        expiresAt: new Date(order.reservedUntil),
      });
      if (url) {
        order.paymentUrl = url;
        await this.orderRepo.update(order.id, { paymentUrl: url });
      }
      return url;
    } catch (e) {
      // Don van giu cho; khach bam "Thanh toan lai" de tao link khi cong hoat dong lai
      this.logger.warn(`Khong tao duoc link payOS cho don ${order.id}: ${(e as Error).message}`);
      return null;
    }
  }

  // Webhook payOS: tim don theo orderCode roi xu ly chung. Don khong ton tai (vd. payOS gui thu khi dang ky webhook) -> bo qua.
  async handlePayosWebhook(result: PayosWebhookResult): Promise<PaymentOutcome | 'UNKNOWN_ORDER'> {
    const order = await this.orderRepo.findOne({ where: { paymentOrderCode: result.orderCode } });
    if (!order) return 'UNKNOWN_ORDER';
    return this.processPayment({ ...result, orderId: order.id });
  }

  findMyOrders(userId: string) {
    return this.orderRepo.find({ where: { userId }, relations: ['campaign'], order: { createdAt: 'DESC' } });
  }

  // FR-ORDER-05: app hoi trang thai don tu may chu, khong tin ket qua tra ve tu cong
  async findMyOrder(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['campaign'] });
    if (!order) throw new NotFoundException('Khong tim thay don hang.');
    if (order.userId !== userId) throw new ForbiddenException('Ban khong co quyen xem don hang nay.');
    return order;
  }

  // ================= Nhan ket qua thanh toan (FR-ORDER-05..08, BR-11, BR-18, BR-20, DC-04, DC-11) =================

  // Webhook JSON chung: xac thuc chu ky truoc moi xu ly
  async handlePaymentWebhook(dto: PaymentWebhookDto) {
    if (!verifyWebhook(dto)) throw new UnauthorizedException('Chu ky webhook khong hop le.');
    const outcome = await this.processPayment({
      orderId: dto.orderId,
      gatewayTxnId: dto.gatewayTxnId,
      amount: Number(dto.amount),
      success: dto.status === 'SUCCESS',
      raw: dto.raw || {},
    });
    return { outcome };
  }

  // Xu ly mot ket qua thanh toan da xac thuc chu ky. Idempotent theo gatewayTxnId.
  // Thong bao gui SAU khi transaction da commit de khong bao nham khi giao dich bi rollback.
  async processPayment(p: PaymentResult): Promise<PaymentOutcome> {
    const outcome = await this.processPaymentTx(p);
    await this.notifyOutcome(p.orderId, outcome);
    return outcome;
  }

  // F16: voucher ve vi (FR-ORDER-10); hoan 100% vi het hang (BR-11)
  private async notifyOutcome(orderId: string, outcome: PaymentOutcome) {
    if (outcome !== 'FULFILLED' && outcome !== 'FULFILLED_LATE' && outcome !== 'REFUNDED_OVERSOLD') return;
    const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['campaign'] });
    if (!order) return;
    const title = order.campaign?.title ?? 'Voucher';
    if (outcome === 'REFUNDED_OVERSOLD') {
      await this.notifications.refundResult(
        order.userId,
        order.id,
        'REFUNDED_OVERSOLD',
        `"${title}" đã hết khi thanh toán của bạn đến. Bạn được hoàn 100% số tiền.`,
      );
    } else {
      await this.notifications.vouchersIssued(order.userId, order.id, title, order.quantity);
    }
  }

  private async processPaymentTx(p: PaymentResult): Promise<PaymentOutcome> {
    return this.dataSource.transaction(async (manager) => {
      // DC-04: cong gui lai cung giao dich -> khong lam gi them
      if (await manager.findOne(Payment, { where: { gatewayTxnId: p.gatewayTxnId } })) return 'DUPLICATE';

      const order = await manager
        .createQueryBuilder(Order, 'o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id: p.orderId })
        .getOne();
      if (!order) throw new NotFoundException('Khong tim thay don hang.');

      const payment = await manager.save(
        manager.create(Payment, {
          orderId: order.id,
          gateway: process.env.PAYMENT_GATEWAY || 'SANDBOX',
          gatewayTxnId: p.gatewayTxnId,
          amount: p.amount,
          status: p.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
          rawPayload: p.raw,
        }),
      );

      // Thanh toan that bai / bi huy: don PENDING -> CANCELLED, nha giu cho
      if (!p.success) {
        if (order.status !== OrderStatus.PENDING) return this.audit(manager, order, 'IGNORED', { reason: 'failed-not-pending' });
        await this.releaseReservation(manager, order);
        order.status = OrderStatus.CANCELLED;
        order.cancelledAt = new Date();
        await manager.save(order);
        return this.audit(manager, order, 'CANCELLED', { gatewayTxnId: p.gatewayTxnId });
      }

      // BR-20: so tien phai khop tong tien don
      if (Number(p.amount) !== Number(order.totalAmount)) {
        if (order.status === OrderStatus.PENDING) await this.releaseReservation(manager, order);
        if (order.status === OrderStatus.PENDING || order.status === OrderStatus.CANCELLED) {
          order.status = OrderStatus.PAYMENT_MISMATCH;
          await manager.save(order);
        }
        // Quan tri vien hoan so tien da nhan qua hang doi hoan tien (F12)
        return this.audit(manager, order, 'PAYMENT_MISMATCH', { paid: p.amount, expected: Number(order.totalAmount) });
      }

      if (order.status === OrderStatus.PENDING) {
        const campaign = await this.lockCampaign(manager, order.campaignId);
        campaign.reservedQuantity = Math.max(0, campaign.reservedQuantity - order.quantity);
        await this.fulfill(manager, order, campaign);
        return this.audit(manager, order, 'FULFILLED', { gatewayTxnId: p.gatewayTxnId });
      }

      // BR-11: thanh toan thanh cong den muon khi don da huy
      if (order.status === OrderStatus.CANCELLED) {
        const campaign = await this.lockCampaign(manager, order.campaignId);
        const issued = await manager.count(VoucherItem, { where: { userId: order.userId, campaignId: campaign.id } });
        const pending = await manager.find(Order, {
          where: { userId: order.userId, campaignId: campaign.id, status: OrderStatus.PENDING },
        });
        const quota = remainingPurchaseQuota(campaign.limitPerUser, issued, pending.reduce((s, o) => s + o.quantity, 0));
        if (availableStock(campaign) >= order.quantity && quota >= order.quantity && campaign.status !== CampaignStatus.ENDED) {
          await this.fulfill(manager, order, campaign);
          return this.audit(manager, order, 'FULFILLED_LATE', { gatewayTxnId: p.gatewayTxnId });
        }
        await this.refundFull(manager, payment, PaymentRefundReason.OVERSOLD);
        order.status = OrderStatus.REFUNDED_OVERSOLD;
        await manager.save(order);
        return this.audit(manager, order, 'REFUNDED_OVERSOLD', { gatewayTxnId: p.gatewayTxnId });
      }

      // DC-11: don da co mot Payment SUCCESS -> giao dich thua, hoan 100%
      await this.refundFull(manager, payment, PaymentRefundReason.MISMATCH);
      return this.audit(manager, order, 'IGNORED', { reason: 'duplicate-success', gatewayTxnId: p.gatewayTxnId });
    });
  }

  // Thanh cong: PAID, chot ty le hoa hong (BR-09), ton kho -> da ban, sinh voucher, FULFILLED - trong 1 transaction
  private async fulfill(manager: EntityManager, order: Order, campaign: VoucherCampaign) {
    const now = new Date();
    order.status = OrderStatus.PAID;
    order.paidAt = now;
    order.commissionRate = await this.currentCommissionRate();
    await manager.save(order);

    campaign.soldQuantity += order.quantity;
    if (availableStock(campaign) === 0 && campaign.status === CampaignStatus.PUBLISHED) campaign.status = CampaignStatus.SOLD_OUT;
    await manager.save(campaign);

    const until = refundableUntil(
      now,
      campaign.voucherExpireAt,
      parseInt(process.env.REFUND_WINDOW_DAYS || '7', 10),
      parseInt(process.env.REFUND_MIN_DAYS_BEFORE_EXPIRE || '3', 10),
    );
    const items = Array.from({ length: order.quantity }, () =>
      manager.create(VoucherItem, {
        orderId: order.id,
        campaignId: campaign.id,
        userId: order.userId,
        code: voucherCode(uuidv4),
        secretKey: crypto.randomBytes(32).toString('hex'),
        status: VoucherItemStatus.ACTIVE,
        expireAt: campaign.voucherExpireAt,
        refundableUntil: until,
      }),
    );
    await manager.save(items);

    order.status = OrderStatus.FULFILLED;
    await manager.save(order);
  }

  // Nha so luong dang giu cho cua don; chien dich SOLD_OUT co hang lai va con thoi gian ban -> PUBLISHED (SRS 6.1)
  private async releaseReservation(manager: EntityManager, order: Order) {
    const campaign = await this.lockCampaign(manager, order.campaignId);
    campaign.reservedQuantity = Math.max(0, campaign.reservedQuantity - order.quantity);
    if (campaign.status === CampaignStatus.SOLD_OUT && availableStock(campaign) > 0 && isOnSale(campaign, new Date())) {
      campaign.status = CampaignStatus.PUBLISHED;
    }
    await manager.save(campaign);
  }

  // Hoan 100% so tien cua giao dich (BR-11 / DC-11). Goi API hoan tien that cua cong la TODO (ASM-02).
  private async refundFull(manager: EntityManager, payment: Payment, reason: PaymentRefundReason) {
    await manager.save(
      manager.create(PaymentRefund, {
        paymentId: payment.id,
        amount: Number(payment.amount),
        reasonType: reason,
        mode: PaymentRefundMode.AUTO,
        status: PaymentRefundStatus.COMPLETED,
        gatewayRefundId: `RF-${Date.now()}`,
        completedAt: new Date(),
      }),
    );
  }

  // UPDATE ... SET reservedQuantity = reservedQuantity + q WHERE con du ton kho; tra ve true neu cap nhat duoc
  private async reserveStock(manager: EntityManager, campaignId: string, quantity: number): Promise<boolean> {
    const col = (name: string) => manager.connection.driver.escape(name);
    // quantity da qua ValidationPipe (so nguyen >= 1); ep kieu lan nua roi chen so de PostgreSQL / MySQL deu tinh so hoc
    const q = Math.trunc(Number(quantity));
    if (!Number.isSafeInteger(q) || q < 1) return false;
    const result = await manager
      .createQueryBuilder()
      .update(VoucherCampaign)
      .set({ reservedQuantity: () => `${col('reservedQuantity')} + ${q}` })
      .where(`${col('id')} = :id`, { id: campaignId })
      .andWhere(`${col('totalQuantity')} - ${col('soldQuantity')} - ${col('reservedQuantity')} >= ${q}`)
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async lockCampaign(manager: EntityManager, campaignId: string) {
    const campaign = await manager
      .createQueryBuilder(VoucherCampaign, 'c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id: campaignId })
      .getOne();
    if (!campaign) throw new NotFoundException('Khong tim thay chien dich.');
    return campaign;
  }

  // Moi nhanh xu ly thanh toan deu ghi nhat ky kiem toan (NFR-SEC-07)
  private async audit(manager: EntityManager, order: Order, outcome: PaymentOutcome, detail: Record<string, unknown>) {
    await manager.save(
      manager.create(AuditLog, {
        actorUserId: null,
        action: `PAYMENT_${outcome}`,
        entityType: 'Order',
        entityId: order.id,
        detail: { status: order.status, ...detail },
      }),
    );
    return outcome;
  }

  private async currentCommissionRate(): Promise<number> {
    const config = await this.configRepo.findOne({ where: { key: 'commission_rate' } });
    return config ? parseFloat(config.value) : parseFloat(process.env.DEFAULT_COMMISSION_RATE || '0.1');
  }

  // ================= Tac vu nen: huy don qua thoi gian giu cho (FR-ORDER-03, NFR-REL-04) =================
  async cancelExpiredOrders(now = new Date()): Promise<number> {
    const expired = await this.orderRepo.find({ where: { status: OrderStatus.PENDING, reservedUntil: LessThan(now) } });
    let cancelled = 0;
    for (const stale of expired) {
      await this.dataSource.transaction(async (manager) => {
        const order = await manager
          .createQueryBuilder(Order, 'o')
          .setLock('pessimistic_write')
          .where('o.id = :id', { id: stale.id })
          .getOne();
        // Webhook co the vua xu ly don nay trong luc job chay
        if (!order || order.status !== OrderStatus.PENDING) return;
        await this.releaseReservation(manager, order);
        order.status = OrderStatus.CANCELLED;
        order.cancelledAt = now;
        await manager.save(order);
        cancelled++;
      });
    }
    if (cancelled) this.logger.log(`Da huy ${cancelled} don qua thoi gian giu cho`);
    return cancelled;
  }
}
