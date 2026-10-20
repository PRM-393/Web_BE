import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { CampaignStatus, OrderStatus, PaymentStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(SystemConfig) private readonly configRepo: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
  ) {}

  // UC-01 luong chinh buoc 1-4: kiem tra, giu cho ton kho TTL 15 phut, tao don PENDING
  // FR-ORDER-02/03, BR-01, BR-02, DC-03
  async createOrder(userId: string, dto: CreateOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      const campaign = await manager.findOne(VoucherCampaign, { where: { id: dto.campaignId } });
      if (!campaign) throw new NotFoundException('Khong tim thay chien dich.');
      if (campaign.status !== CampaignStatus.PUBLISHED) {
        throw new BadRequestException('Chien dich khong con dang ban.');
      }

      const remaining = campaign.totalQuantity - campaign.soldQuantity - campaign.reservedQuantity;
      if (dto.quantity > remaining) {
        throw new BadRequestException('Khong du ton kho cho so luong yeu cau.');
      }

      const alreadyOwned = await manager.count(Order, {
        where: { userId, campaignId: campaign.id, status: OrderStatus.PAID },
      });
      if (alreadyOwned + dto.quantity > campaign.limitPerUser) {
        throw new BadRequestException(
          `Vuot gioi han mua moi nguoi (toi da ${campaign.limitPerUser}).`,
        );
      }

      campaign.reservedQuantity += dto.quantity;
      await manager.save(campaign);

      const ttlMinutes = parseInt(process.env.ORDER_RESERVATION_TTL_MINUTES || '15', 10);
      const order = manager.create(Order, {
        userId,
        campaignId: campaign.id,
        quantity: dto.quantity,
        unitPrice: campaign.salePrice,
        totalAmount: campaign.salePrice * dto.quantity,
        status: OrderStatus.PENDING,
        reservedUntil: new Date(Date.now() + ttlMinutes * 60 * 1000),
      });
      const saved = await manager.save(order);

      // TODO(FR-ORDER-04): goi API cong thanh toan sandbox de tao paymentUrl va chuyen khach sang giao dien thanh toan
      return { order: saved, paymentUrl: `https://sandbox-gateway.local/pay/${saved.id}` };
    });
  }

  findMyOrders(userId: string) {
    return this.orderRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  // FR-REDEEM-01: voucher cua khach kem thong tin chien dich; bo secretKey khoi response (NFR-SEC-05)
  async findMyVouchers(userId: string) {
    const items = await this.voucherItemRepo.find({
      where: { userId },
      relations: ['campaign'],
      order: { issuedAt: 'DESC' },
    });
    return items.map(({ secretKey: _secretKey, ...rest }) => rest);
  }

  // FR-ORDER-05/06/07/08, BR-18, DC-04, UC-01 buoc 6-9
  // TODO(NFR-SEC): xac thuc chu ky HMAC cua webhook truoc khi xu ly (BR-18) - hien tai la stub.
  async handlePaymentWebhook(dto: PaymentWebhookDto) {
    this.verifyWebhookSignature(dto);

    // idempotent theo gatewayTxnId (FR-ORDER-06, DC-04)
    const existingPayment = await this.paymentRepo.findOne({
      where: { gatewayTxnId: dto.gatewayTxnId },
    });
    if (existingPayment) {
      return { message: 'Webhook da duoc xu ly truoc do (idempotent).' };
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: dto.orderId } });
      if (!order) throw new NotFoundException('Khong tim thay don hang.');

      const payment = manager.create(Payment, {
        orderId: order.id,
        gateway: process.env.PAYMENT_GATEWAY || 'SANDBOX',
        gatewayTxnId: dto.gatewayTxnId,
        amount: dto.amount,
        status: dto.status === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
        rawPayload: dto.raw || {},
      });
      await manager.save(payment);

      if (dto.status === 'SUCCESS' && Number(dto.amount) !== Number(order.totalAmount)) {
        // BR-20: lech so tien -> PAYMENT_MISMATCH, cho quan tri vien hoan lai so tien da nhan
        if (order.status === OrderStatus.PENDING) {
          const campaign = await manager.findOneOrFail(VoucherCampaign, { where: { id: order.campaignId }, lock: { mode: 'pessimistic_write' } });
          campaign.reservedQuantity = Math.max(0, campaign.reservedQuantity - order.quantity);
          await manager.save(campaign);
        }
        order.status = OrderStatus.PAYMENT_MISMATCH;
        await manager.save(order);
        return { message: 'So tien thanh toan khong khop don hang, chuyen quan tri vien xu ly.' };
      }

      if (dto.status !== 'SUCCESS' || order.status !== OrderStatus.PENDING) {
        return { message: 'Ghi nhan thanh toan, khong phat hanh voucher.' };
      }

      const campaign = await manager.findOneOrFail(VoucherCampaign, { where: { id: order.campaignId } });
      const remaining = campaign.totalQuantity - campaign.soldQuantity;

      if (remaining < order.quantity) {
        // FR-ORDER-08, BR-11: het ton kho -> tu dong hoan 100%
        order.status = OrderStatus.REFUNDED_OVERSOLD;
        await manager.save(order);
        campaign.reservedQuantity = Math.max(0, campaign.reservedQuantity - order.quantity);
        await manager.save(campaign);
        // TODO: goi API hoan tien cong thanh toan that su
        return { message: 'Het ton kho, don hang da duoc tu dong hoan tien 100%.' };
      }

      order.status = OrderStatus.PAID;
      order.paidAt = new Date();
      order.commissionRate = await this.currentCommissionRate();
      await manager.save(order);

      campaign.reservedQuantity = Math.max(0, campaign.reservedQuantity - order.quantity);
      campaign.soldQuantity += order.quantity;
      await manager.save(campaign);

      const day = 24 * 60 * 60 * 1000;
      const refundWindowDays = parseInt(process.env.REFUND_WINDOW_DAYS || '7', 10);
      const minDaysBeforeExpire = parseInt(process.env.REFUND_MIN_DAYS_BEFORE_EXPIRE || '3', 10);
      const refundableUntil = new Date(
        Math.min(
          order.paidAt.getTime() + refundWindowDays * day,
          new Date(campaign.voucherExpireAt).getTime() - minDaysBeforeExpire * day,
        ),
      );

      const items: VoucherItem[] = [];
      for (let i = 0; i < order.quantity; i++) {
        items.push(
          manager.create(VoucherItem, {
            orderId: order.id,
            campaignId: campaign.id,
            userId: order.userId,
            code: `VC-${uuidv4()}`,
            secretKey: crypto.randomBytes(32).toString('hex'),
            status: VoucherItemStatus.ACTIVE,
            expireAt: campaign.voucherExpireAt,
            refundableUntil,
          }),
        );
      }
      await manager.save(items);
      order.status = OrderStatus.FULFILLED;
      await manager.save(order);

      // TODO: gui push + email thong bao phat hanh voucher (FR-ORDER-10)
      return { message: 'Thanh toan thanh cong, voucher da duoc phat hanh.', voucherItemIds: items.map((i) => i.id) };
    });
  }

  // Tac vu nen: het TTL 15 phut chua thanh toan -> huy don, nha ton kho (FR-ORDER-03, NFR-REL-04)
  async releaseExpiredReservations() {
    const expired = await this.orderRepo.find({
      where: { status: OrderStatus.PENDING },
    });
    const now = new Date();
    for (const order of expired) {
      if (order.reservedUntil < now) {
        await this.dataSource.transaction(async (manager) => {
          order.status = OrderStatus.CANCELLED;
          order.cancelledAt = now;
          await manager.save(order);
          await manager.decrement(VoucherCampaign, { id: order.campaignId }, 'reservedQuantity', order.quantity);
        });
      }
    }
  }

  private async currentCommissionRate(): Promise<number> {
    const config = await this.configRepo.findOne({ where: { key: 'commission_rate' } });
    return config ? parseFloat(config.value) : parseFloat(process.env.DEFAULT_COMMISSION_RATE || '0.1');
  }

  private verifyWebhookSignature(dto: PaymentWebhookDto) {
    // TODO(BR-18): tinh HMAC-SHA256 tren payload voi PAYMENT_GATEWAY_SECRET_KEY va so sanh voi dto.signature.
    // Neu khong khop, throw new ConflictException('Chu ky webhook khong hop le.');
    if (!dto.signature) {
      throw new ConflictException('Thieu chu ky webhook.');
    }
  }
}
