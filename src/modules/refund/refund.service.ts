import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { RefundRequest } from '../../entities/refund-request.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentRefund } from '../../entities/payment-refund.entity';
import {
  CampaignStatus,
  PaymentRefundMode,
  PaymentRefundReason,
  PaymentRefundStatus,
  PaymentStatus,
  RefundRequestStatus,
  VoucherItemStatus,
} from '../../common/enums/status.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CreateRefundDto } from './dto/create-refund.dto';
import { NotificationService } from '../notification/notification.service';
import { RefundGateway, RefundGatewayResult } from './refund-gateway';
import { OPEN_REFUND_STATUSES, refundEligibility, statusAfterFailedRefund } from './refund.rules';

export const REFUND_STATUS_LABELS: Record<RefundRequestStatus, string> = {
  [RefundRequestStatus.REQUESTED]: 'Đã gửi yêu cầu',
  [RefundRequestStatus.PROCESSING]: 'Đang xử lý',
  [RefundRequestStatus.MANUAL_PENDING]: 'Chờ quản trị viên hoàn tiền',
  [RefundRequestStatus.COMPLETED]: 'Hoàn tiền thành công',
  [RefundRequestStatus.REJECTED]: 'Không đủ điều kiện',
  [RefundRequestStatus.FAILED]: 'Hoàn tiền không thành công',
};

const REFUND_RELATIONS = ['voucherItem', 'voucherItem.campaign', 'voucherItem.order', 'paymentRefund'];

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(RefundRequest) private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly gateway: RefundGateway,
  ) {}

  // F16 (FR-REFUND-09): bao ket qua hoan tien cho khach; loi gui thong bao khong lam hong yeu cau hoan
  private async notifyResult(refund: RefundRequest) {
    const messages: Partial<Record<RefundRequestStatus, string>> = {
      [RefundRequestStatus.COMPLETED]: 'Yêu cầu hoàn tiền của bạn đã hoàn tất, tiền sẽ về tài khoản thanh toán.',
      [RefundRequestStatus.REJECTED]: `Yêu cầu hoàn tiền bị từ chối: ${refund.rejectReason ?? 'không đủ điều kiện'}.`,
      [RefundRequestStatus.MANUAL_PENDING]: 'Yêu cầu hoàn tiền đang được quản trị viên xử lý thủ công.',
      [RefundRequestStatus.FAILED]: `Hoàn tiền không thành công: ${refund.rejectReason ?? 'cổng thanh toán từ chối'}. Voucher đã được khôi phục.`,
    };
    const message = messages[refund.status];
    if (!message) return;
    try {
      await this.notifications.refundResult(refund.userId, refund.id, refund.status, message);
    } catch {
      // thong bao la phu
    }
  }

  // ================= UC-03, FR-REFUND-01..06, BR-05: khach yeu cau hoan, he thong tu xet theo quy tac =================

  async requestRefund(userId: string, dto: CreateRefundDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) throw new NotFoundException('Không tìm thấy voucher.');

    const hasOpen = (await this.refundRepo.count({ where: { voucherItemId: item.id, status: In(OPEN_REFUND_STATUSES) } })) > 0;
    const eligibility = refundEligibility(item, hasOpen, new Date());
    if (!eligibility.canRefund) {
      // Khong du dieu kien: ghi yeu cau REJECTED kem ly do (SRS 6.4) de khach xem lai trong danh sach
      const rejected = await this.refundRepo.save(
        this.refundRepo.create({
          voucherItemId: item.id,
          userId,
          reason: dto.reason,
          status: RefundRequestStatus.REJECTED,
          rejectReason: eligibility.reason ?? 'Không đủ điều kiện hoàn tiền.',
          decidedAt: new Date(),
        }),
      );
      await this.notifyResult(rejected);
      return this.view(rejected.id);
    }

    // Du dieu kien: khoa voucher, xet lai trong transaction, voucher -> REFUND_PENDING (khong duoc redeem - BR-22)
    const refund = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOneOrFail(VoucherItem, { where: { id: item.id }, lock: { mode: 'pessimistic_write' } });
      const openNow = await manager.count(RefundRequest, {
        where: { voucherItemId: item.id, status: In(OPEN_REFUND_STATUSES) },
      });
      const again = refundEligibility(locked, openNow > 0, new Date());
      if (!again.canRefund) throw new BusinessException(again.reasonCode!, again.reason!);
      locked.status = VoucherItemStatus.REFUND_PENDING;
      await manager.save(locked);
      return manager.save(
        manager.create(RefundRequest, {
          voucherItemId: item.id,
          userId,
          reason: dto.reason,
          status: RefundRequestStatus.PROCESSING,
        }),
      );
    });

    // REFUND_MODE=manual: khong goi cong, quan tri vien hoan tay roi xac nhan (UC-07)
    if ((process.env.REFUND_MODE || 'auto').toLowerCase() === 'manual') {
      await this.toManualPending(refund.id);
    } else {
      await this.callGateway(refund.id);
    }
    const final = await this.refundRepo.findOneOrFail({ where: { id: refund.id } });
    await this.notifyResult(final);
    return this.view(refund.id);
  }

  // Goi cong ngoai transaction (khong giu khoa CSDL trong luc cho cong tra loi)
  private async callGateway(refundId: string) {
    const refund = await this.refundRepo.findOneOrFail({ where: { id: refundId }, relations: ['voucherItem'] });
    const order = await this.dataSource.getRepository(Order).findOneOrFail({ where: { id: refund.voucherItem.orderId } });
    const payment = await this.dataSource
      .getRepository(Payment)
      .findOne({ where: { orderId: order.id, status: PaymentStatus.SUCCESS } });
    if (!payment) {
      // Khong co giao dich goc de hoan tu dong -> quan tri vien xu ly
      await this.toManualPending(refundId);
      return;
    }
    const amount = Number(order.unitPrice);
    // DC-12: kiem tra truoc khi goi cong, khong gui lenh hoan vuot so da thanh toan
    if ((await this.completedRefundTotal(this.dataSource.manager, payment.id)) + amount > Number(payment.amount)) {
      await this.failRefund(refundId, 'Tổng tiền hoàn vượt số tiền đã thanh toán (DC-12).', null);
      return;
    }

    let result: RefundGatewayResult;
    try {
      result = await this.gateway.refund({
        refundRequestId: refundId,
        paymentId: payment.id,
        gateway: payment.gateway,
        gatewayTxnId: payment.gatewayTxnId,
        amount,
      });
    } catch {
      result = { status: 'UNAVAILABLE', message: 'Không kết nối được cổng thanh toán.' };
    }

    if (result.status === 'SUCCESS') {
      await this.dataSource.transaction((manager) =>
        this.completeRefund(manager, refundId, { mode: PaymentRefundMode.AUTO, gatewayRefundId: result.gatewayRefundId }),
      );
    } else if (result.status === 'DECLINED') {
      await this.failRefund(refundId, result.message, { paymentId: payment.id, amount });
    } else {
      await this.toManualPending(refundId);
    }
  }

  private async toManualPending(refundId: string) {
    await this.refundRepo.update({ id: refundId }, { status: RefundRequestStatus.MANUAL_PENDING });
  }

  private async completedRefundTotal(manager: EntityManager, paymentId: string) {
    const previous = await manager.find(PaymentRefund, { where: { paymentId, status: PaymentRefundStatus.COMPLETED } });
    return previous.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  // Hoan thanh cong (tu dong hoac quan tri vien xac nhan): REFUNDED, ghi PaymentRefund, cong refundedAmount,
  // tra lai ton kho neu chien dich chua ENDED va con thoi gian ban (SOLD_OUT -> PUBLISHED) - FR-REFUND-05, BR-13, DC-12
  private async completeRefund(
    manager: EntityManager,
    refundId: string,
    opts: { mode: PaymentRefundMode; gatewayRefundId: string; actorUserId?: string },
  ) {
    const refund = await manager.findOne(RefundRequest, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
    const expected = opts.mode === PaymentRefundMode.MANUAL ? RefundRequestStatus.MANUAL_PENDING : RefundRequestStatus.PROCESSING;
    if (!refund || refund.status !== expected) {
      throw new BadRequestException(
        opts.mode === PaymentRefundMode.MANUAL ? 'Yêu cầu không còn chờ hoàn thủ công.' : 'Yêu cầu không còn ở trạng thái xử lý.',
      );
    }
    const item = await manager.findOneOrFail(VoucherItem, { where: { id: refund.voucherItemId }, lock: { mode: 'pessimistic_write' } });
    if (item.status !== VoucherItemStatus.REFUND_PENDING) throw new BadRequestException('Voucher không ở trạng thái chờ hoàn.');
    const order = await manager.findOneOrFail(Order, { where: { id: item.orderId }, lock: { mode: 'pessimistic_write' } });
    const payment = await manager.findOneOrFail(Payment, {
      where: { orderId: order.id, status: PaymentStatus.SUCCESS },
      lock: { mode: 'pessimistic_write' },
    });
    const amount = Number(order.unitPrice);
    if ((await this.completedRefundTotal(manager, payment.id)) + amount > Number(payment.amount)) {
      throw new BadRequestException('Số tiền hoàn vượt giao dịch đã nhận.');
    }

    const now = new Date();
    const paymentRefund = await manager.save(
      PaymentRefund,
      manager.create(PaymentRefund, {
        paymentId: payment.id,
        amount,
        reasonType: PaymentRefundReason.CUSTOMER_REQUEST,
        mode: opts.mode,
        status: PaymentRefundStatus.COMPLETED,
        gatewayRefundId: opts.gatewayRefundId.trim(),
        processedBy: opts.actorUserId ?? null,
        completedAt: now,
      }),
    );
    item.status = VoucherItemStatus.REFUNDED;
    order.refundedAmount = Number(order.refundedAmount) + amount;
    refund.status = RefundRequestStatus.COMPLETED;
    refund.decidedAt = now;
    refund.paymentRefundId = paymentRefund.id;
    await manager.save(item);
    await manager.save(order);
    await manager.save(refund);

    const campaign = await manager.findOneOrFail(VoucherCampaign, { where: { id: item.campaignId }, lock: { mode: 'pessimistic_write' } });
    if (campaign.status !== CampaignStatus.ENDED && new Date(campaign.saleEndAt) > now) {
      campaign.soldQuantity = Math.max(0, campaign.soldQuantity - 1);
      if (campaign.status === CampaignStatus.SOLD_OUT) campaign.status = CampaignStatus.PUBLISHED;
      await manager.save(campaign);
    }
    return paymentRefund;
  }

  // Cong tu choi / quan tri vien khong hoan duoc: yeu cau FAILED, voucher ve ACTIVE hoac EXPIRED (SRS 6.2, 6.4)
  private async failRefund(
    refundId: string,
    reason: string,
    gatewayAttempt: { paymentId: string; amount: number } | null,
    actorUserId?: string,
    fromStatus = RefundRequestStatus.PROCESSING,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const refund = await manager.findOne(RefundRequest, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
      if (!refund || refund.status !== fromStatus) {
        throw new BadRequestException('Yêu cầu không còn ở trạng thái có thể đánh dấu không hoàn được.');
      }
      const item = await manager.findOneOrFail(VoucherItem, { where: { id: refund.voucherItemId }, lock: { mode: 'pessimistic_write' } });
      const now = new Date();
      if (gatewayAttempt) {
        // Ghi lai lan goi cong that bai de doi soat
        await manager.save(
          PaymentRefund,
          manager.create(PaymentRefund, {
            paymentId: gatewayAttempt.paymentId,
            amount: gatewayAttempt.amount,
            reasonType: PaymentRefundReason.CUSTOMER_REQUEST,
            mode: PaymentRefundMode.AUTO,
            status: PaymentRefundStatus.FAILED,
            completedAt: now,
          }),
        );
      }
      if (item.status === VoucherItemStatus.REFUND_PENDING) {
        item.status = statusAfterFailedRefund(item.expireAt, now);
        await manager.save(item);
      }
      refund.status = RefundRequestStatus.FAILED;
      refund.rejectReason = reason;
      refund.decidedAt = now;
      await manager.save(refund);
      if (actorUserId) {
        await manager.save(
          AuditLog,
          manager.create(AuditLog, {
            actorUserId,
            action: 'FAIL_MANUAL_REFUND',
            entityType: 'RefundRequest',
            entityId: refundId,
            detail: { reason, voucherStatus: item.status },
          }),
        );
      }
    });
  }

  // ================= UC-07: hang doi quan tri vien (FR-REFUND-06) =================

  // Quan tri vien da hoan tay qua cong / ngan hang: nhap ma giao dich, ghi AuditLog
  async confirmManualRefund(id: string, actorUserId: string, gatewayRefundId: string) {
    await this.dataSource.transaction(async (manager) => {
      const paymentRefund = await this.completeRefund(manager, id, {
        mode: PaymentRefundMode.MANUAL,
        gatewayRefundId,
        actorUserId,
      });
      await manager.save(
        AuditLog,
        manager.create(AuditLog, {
          actorUserId,
          action: 'CONFIRM_MANUAL_REFUND',
          entityType: 'RefundRequest',
          entityId: id,
          detail: { paymentRefundId: paymentRefund.id },
        }),
      );
    });
    const refund = await this.refundRepo.findOne({ where: { id } });
    if (refund) await this.notifyResult(refund);
    return { message: 'Đã ghi nhận hoàn tiền thủ công.' };
  }

  // Quan tri vien khong hoan duoc (vd. tai khoan khach bi dong): yeu cau FAILED, voucher duoc khoi phuc
  async failManualRefund(id: string, actorUserId: string, reason: string) {
    await this.failRefund(id, reason.trim(), null, actorUserId, RefundRequestStatus.MANUAL_PENDING);
    const refund = await this.refundRepo.findOne({ where: { id } });
    if (refund) await this.notifyResult(refund);
    return { message: 'Đã ghi nhận không hoàn được tiền, voucher đã được khôi phục cho khách.' };
  }

  // ================= Danh sach =================

  // FR-REFUND-07: khach theo doi cac yeu cau hoan tien
  async findMyRequests(userId: string) {
    const list = await this.refundRepo.find({ where: { userId }, relations: REFUND_RELATIONS, order: { createdAt: 'DESC' } });
    return list.map((r) => this.toView(r));
  }

  // FR-REFUND-06: yeu cau cho quan tri vien hoan thu cong, kem thong tin de doi chieu
  async findManualPending() {
    const list = await this.refundRepo.find({
      where: { status: RefundRequestStatus.MANUAL_PENDING },
      relations: [...REFUND_RELATIONS, 'user'],
      order: { createdAt: 'ASC' },
    });
    const payments = await this.dataSource.getRepository(Payment).find({
      where: { orderId: In(list.map((r) => r.voucherItem?.orderId).filter(Boolean)), status: PaymentStatus.SUCCESS },
    });
    return list.map((r) => {
      const payment = payments.find((p) => p.orderId === r.voucherItem?.orderId);
      return {
        ...this.toView(r),
        customer: r.user ? { id: r.user.id, email: r.user.email, fullName: r.user.fullName ?? null, phone: r.user.phone ?? null } : null,
        payment: payment
          ? { id: payment.id, gateway: payment.gateway, gatewayTxnId: payment.gatewayTxnId, amount: Number(payment.amount) }
          : null,
      };
    });
  }

  private async view(id: string) {
    return this.toView(await this.refundRepo.findOneOrFail({ where: { id }, relations: REFUND_RELATIONS }));
  }

  // Khong tra secretKey cua voucher hay du lieu noi bo; amount = don gia voucher se duoc hoan
  private toView(r: RefundRequest) {
    const item = r.voucherItem;
    return {
      id: r.id,
      voucherItemId: r.voucherItemId,
      userId: r.userId,
      status: r.status,
      statusLabel: REFUND_STATUS_LABELS[r.status],
      reason: r.reason ?? null,
      rejectReason: r.rejectReason ?? null,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt ?? null,
      amount: item?.order ? Number(item.order.unitPrice) : null,
      voucherCode: item?.code ?? null,
      voucherStatus: item?.status ?? null,
      campaignId: item?.campaignId ?? null,
      campaignTitle: item?.campaign?.title ?? null,
      paymentRefund: r.paymentRefund
        ? {
            id: r.paymentRefund.id,
            mode: r.paymentRefund.mode,
            status: r.paymentRefund.status,
            gatewayRefundId: r.paymentRefund.gatewayRefundId,
            completedAt: r.paymentRefund.completedAt,
          }
        : null,
    };
  }
}
