import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RefundRequest } from '../../entities/refund-request.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { RefundRequestStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { CreateRefundDto } from './dto/create-refund.dto';

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(RefundRequest) private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    private readonly dataSource: DataSource,
  ) {}

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
      return refund;
    }

    return this.processRefund(refund, item);
  }

  // BR-05: chua su dung, trong 7 ngay ke tu ngay mua, con it nhat 3 ngay truoc han su dung
  private checkEligibility(item: VoucherItem): { eligible: boolean; reason?: string } {
    if (item.status !== VoucherItemStatus.ACTIVE) {
      return { eligible: false, reason: 'Voucher da duoc su dung hoac khong con hieu luc.' };
    }
    const refundWindowDays = parseInt(process.env.REFUND_WINDOW_DAYS || '7', 10);
    const minDaysBeforeExpire = parseInt(process.env.REFUND_MIN_DAYS_BEFORE_EXPIRE || '3', 10);

    const daysSincePurchase = (Date.now() - item.issuedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase > refundWindowDays) {
      return { eligible: false, reason: `Da qua ${refundWindowDays} ngay ke tu ngay mua.` };
    }

    const daysUntilExpire = (item.expireAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpire < minDaysBeforeExpire) {
      return { eligible: false, reason: `Con it hon ${minDaysBeforeExpire} ngay truoc han su dung.` };
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

        item.status = VoucherItemStatus.REFUNDED;
        await manager.save(item);

        await manager.increment(VoucherCampaign, { id: item.campaignId }, 'soldQuantity', -1);

        refund.status = RefundRequestStatus.COMPLETED;
        refund.decidedAt = new Date();
        refund.refundTxnId = `RF-${Date.now()}`;
        await manager.save(refund);

        // TODO: loai don hang khoi doanh thu doi soat (BR-13) khi module settlement tinh toan ky tiep theo
        return refund;
      } catch (e) {
        throw new BadRequestException('Khong the xu ly hoan tien luc nay.');
      }
    });
  }

  // Quan tri vien xac nhan hoan tien thu cong khi cong thanh toan khong kha dung - FR-REFUND-06
  async confirmManualRefund(id: string) {
    const refund = await this.refundRepo.findOne({ where: { id } });
    if (!refund) throw new NotFoundException('Khong tim thay yeu cau hoan tien.');
    if (refund.status !== RefundRequestStatus.MANUAL_PENDING) {
      throw new BadRequestException('Yeu cau khong o trang thai cho xu ly thu cong.');
    }
    const item = await this.voucherItemRepo.findOneOrFail({ where: { id: refund.voucherItemId } });
    return this.processRefund(refund, item);
  }

  findMyRequests(userId: string) {
    return this.refundRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
