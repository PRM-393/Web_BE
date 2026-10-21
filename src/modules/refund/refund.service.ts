import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RefundRequest } from '../../entities/refund-request.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { CampaignStatus } from '../../common/enums/status.enum';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentRefund } from '../../entities/payment-refund.entity';
import {
  PaymentRefundMode,
  PaymentRefundReason,
  PaymentRefundStatus,
  PaymentStatus,
  RefundRequestStatus,
  VoucherItemStatus,
} from '../../common/enums/status.enum';
import { CreateRefundDto } from './dto/create-refund.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(RefundRequest) private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  // F16 (FR-REFUND-09): bao ket qua hoan tien cho khach; loi gui thong bao khong lam hong yeu cau hoan
  private async notifyResult(refund: RefundRequest) {
    const messages: Partial<Record<RefundRequestStatus, string>> = {
      [RefundRequestStatus.COMPLETED]: 'Yêu cầu hoàn tiền của bạn đã hoàn tất, tiền sẽ về tài khoản thanh toán.',
      [RefundRequestStatus.REJECTED]: `Yêu cầu hoàn tiền bị từ chối: ${refund.rejectReason ?? 'không đủ điều kiện'}.`,
      [RefundRequestStatus.MANUAL_PENDING]: 'Yêu cầu hoàn tiền đang được quản trị viên xử lý thủ công.',
    };
    const message = messages[refund.status];
    if (!message) return;
    try {
      await this.notifications.refundResult(refund.userId, refund.id, refund.status, message);
    } catch {
      // thong bao la phu
    }
  }

  // UC-03, FR-REFUND-01..06, BR-05: tu dong xet duyet theo quy tac, khong can nguoi phe duyet
  async requestRefund(userId: string, dto: CreateRefundDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Khong tim thay voucher.');
    }

    const refund = this.refundRepo.create({
      voucherItemId: item.id,
      userId,
      reason: dto.reason,
      status: RefundRequestStatus.REQUESTED,
    });
    await this.refundRepo.save(refund);

    const eligibility = this.checkEligibility(item);
    if (!eligibility.eligible) {
      refund.status = RefundRequestStatus.REJECTED;
      refund.rejectReason = eligibility.reason || 'Khong du dieu kien hoan tien.';
      refund.decidedAt = new Date();
      await this.refundRepo.save(refund);
      await this.notifyResult(refund);
      return refund;
    }

    const processed = await this.processRefund(refund, item);
    await this.notifyResult(processed);
    return processed;
  }

  // BR-05: chua su dung, trong 7 ngay ke tu ngay mua, con it nhat 3 ngay truoc han su dung
  private checkEligibility(item: VoucherItem): { eligible: boolean; reason?: string } {
    if (item.status !== VoucherItemStatus.ACTIVE) {
      return { eligible: false, reason: 'Voucher da duoc su dung hoac khong con hieu luc.' };
    }
    // BR-05: refundableUntil = min(ngay mua + 7 ngay, han su dung - 3 ngay), tinh luc phat hanh voucher
    if (Date.now() > item.refundableUntil.getTime()) {
      return { eligible: false, reason: 'Da qua thoi han duoc hoan tien cua voucher.' };
    }
    return { eligible: true };
  }

  // FR-REFUND-05/06, BR-13: voucher -> REFUNDED, tra lai ton kho, huy ban ghi hoa hong
  private async processRefund(refund: RefundRequest, item: VoucherItem) {
    return this.dataSource.transaction(async (manager) => {
      try {
        // TODO(BR-18/ASM-02): goi API hoan tien that su cua cong thanh toan sandbox.
        // Neu API khong kha dung, chuyen sang MANUAL_PENDING cho quan tri vien xac nhan thu cong (FR-REFUND-06).
        const gatewaySucceeded = true;

        if (!gatewaySucceeded) {
          refund.status = RefundRequestStatus.MANUAL_PENDING;
          await manager.save(refund);
          return refund;
        }

        // Ghi giao dich hoan tai cong theo don gia cua voucher (FR-REFUND-05, DC-12)
        const order = await manager.findOneOrFail(Order, { where: { id: item.orderId } });
        const payment = await manager.findOneOrFail(Payment, {
          where: { orderId: order.id, status: PaymentStatus.SUCCESS },
        });
        const paymentRefund = await manager.save(
          manager.create(PaymentRefund, {
            paymentId: payment.id,
            amount: Number(order.unitPrice),
            reasonType: PaymentRefundReason.CUSTOMER_REQUEST,
            mode: PaymentRefundMode.AUTO,
            status: PaymentRefundStatus.COMPLETED,
            gatewayRefundId: `RF-${Date.now()}`,
            completedAt: new Date(),
          }),
        );
        order.refundedAmount = Number(order.refundedAmount) + Number(order.unitPrice);
        await manager.save(order);

        item.status = VoucherItemStatus.REFUNDED;
        await manager.save(item);

        await manager.increment(VoucherCampaign, { id: item.campaignId }, 'soldQuantity', -1);

        refund.status = RefundRequestStatus.COMPLETED;
        refund.decidedAt = new Date();
        refund.paymentRefundId = paymentRefund.id;
        await manager.save(refund);

        // TODO: loai don hang khoi doanh thu doi soat (BR-13) khi module settlement tinh toan ky tiep theo
        return refund;
      } catch (e) {
        throw new BadRequestException('Khong the xu ly hoan tien luc nay.');
      }
    });
  }

  // Quan tri vien xac nhan hoan tien thu cong khi cong thanh toan khong kha dung - FR-REFUND-06
  async confirmManualRefund(id: string, actorUserId: string, gatewayRefundId: string) {
    const result = await this.dataSource.transaction(async manager => {
      const refund = await manager.findOne(RefundRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!refund || refund.status !== RefundRequestStatus.MANUAL_PENDING) throw new BadRequestException('Yêu cầu không còn chờ hoàn thủ công.');
      const item = await manager.findOneOrFail(VoucherItem, { where: { id: refund.voucherItemId }, lock: { mode: 'pessimistic_write' } });
      if (item.status !== VoucherItemStatus.REFUND_PENDING) throw new BadRequestException('Voucher không ở trạng thái chờ hoàn.');
      const order = await manager.findOneOrFail(Order, { where: { id: item.orderId }, lock: { mode: 'pessimistic_write' } });
      const payment = await manager.findOneOrFail(Payment, { where: { orderId: order.id, status: PaymentStatus.SUCCESS }, lock: { mode: 'pessimistic_write' } });
      const previous = await manager.find(PaymentRefund, { where: { paymentId: payment.id, status: PaymentRefundStatus.COMPLETED } });
      const amount = Number(order.unitPrice);
      if (previous.reduce((sum, p) => sum + Number(p.amount), 0) + amount > Number(payment.amount)) throw new BadRequestException('Số tiền hoàn vượt giao dịch đã nhận.');
      const paymentRefund = await manager.save(PaymentRefund, manager.create(PaymentRefund, {
        paymentId: payment.id, amount, reasonType: PaymentRefundReason.CUSTOMER_REQUEST,
        mode: PaymentRefundMode.MANUAL, status: PaymentRefundStatus.COMPLETED,
        gatewayRefundId: gatewayRefundId.trim(), processedBy: actorUserId, completedAt: new Date(),
      }));
      item.status = VoucherItemStatus.REFUNDED;
      order.refundedAmount = Number(order.refundedAmount) + amount;
      refund.status = RefundRequestStatus.COMPLETED;
      refund.decidedAt = new Date();
      refund.paymentRefundId = paymentRefund.id;
      await manager.save(item); await manager.save(order); await manager.save(refund);
      const campaign = await manager.findOneOrFail(VoucherCampaign, { where: { id: item.campaignId }, lock: { mode: 'pessimistic_write' } });
      if (campaign.status !== CampaignStatus.ENDED && campaign.saleEndAt > new Date()) {
        campaign.soldQuantity = Math.max(0, campaign.soldQuantity - 1);
        if (campaign.status === CampaignStatus.SOLD_OUT) campaign.status = CampaignStatus.PUBLISHED;
        await manager.save(campaign);
      }
      await manager.save(AuditLog, manager.create(AuditLog, { actorUserId, action: 'CONFIRM_MANUAL_REFUND', entityType: 'RefundRequest', entityId: id, detail: { paymentRefundId: paymentRefund.id } }));
      return { message: 'Đã ghi nhận hoàn tiền thủ công.' };
    });
    const refund = await this.refundRepo.findOne({ where: { id } });
    if (refund) await this.notifyResult(refund);
    return result;
  }

  findMyRequests(userId: string) {
    return this.refundRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  // FR-REFUND-06: yeu cau dang cho quan tri vien xac nhan hoan tien thu cong
  findManualPending() {
    return this.refundRepo.find({
      where: { status: RefundRequestStatus.MANUAL_PENDING },
      order: { createdAt: 'ASC' },
    });
  }
}
