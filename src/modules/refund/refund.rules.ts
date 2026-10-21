import { RefundRequestStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { formatVnDateTime } from '../../common/utils/vn-time';

// Yeu cau hoan dang xu ly: chua co ket qua cuoi cung
export const OPEN_REFUND_STATUSES = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.PROCESSING,
  RefundRequestStatus.MANUAL_PENDING,
];

export interface RefundEligibility {
  canRefund: boolean;
  reasonCode: string | null;
  reason: string | null;
  refundableUntil: Date;
}

// BR-05: chi voucher ACTIVE, con han, truoc refundableUntil va chua co yeu cau dang xu ly moi duoc hoan.
// Dung chung cho API hoan tien va vi (app khoa nut "Hoàn tiền" kem ly do - FR-REFUND-04/07).
export function refundEligibility(
  item: { status: VoucherItemStatus; expireAt: Date; refundableUntil: Date },
  hasOpenRequest: boolean,
  now: Date,
): RefundEligibility {
  const refundableUntil = new Date(item.refundableUntil);
  const deny = (reasonCode: string, reason: string): RefundEligibility => ({ canRefund: false, reasonCode, reason, refundableUntil });

  if (item.status === VoucherItemStatus.USED) return deny('VOUCHER_USED', 'Voucher đã được sử dụng nên không thể hoàn tiền.');
  if (item.status === VoucherItemStatus.REFUNDED) return deny('VOUCHER_REFUNDED', 'Voucher đã được hoàn tiền.');
  if (item.status === VoucherItemStatus.REFUND_PENDING || hasOpenRequest) {
    return deny('REFUND_IN_PROGRESS', 'Voucher đang có yêu cầu hoàn tiền được xử lý.');
  }
  if (item.status === VoucherItemStatus.EXPIRED || new Date(item.expireAt).getTime() <= now.getTime()) {
    return deny('VOUCHER_EXPIRED', 'Voucher đã hết hạn sử dụng nên không thể hoàn tiền.');
  }
  if (now.getTime() > refundableUntil.getTime()) {
    return deny('REFUND_WINDOW_PASSED', `Đã quá hạn hoàn tiền (hạn chót ${formatVnDateTime(refundableUntil)}).`);
  }
  return { canRefund: true, reasonCode: null, reason: null, refundableUntil };
}

// Hoan that bai / khong hoan duoc: tra voucher ve trang thai truoc do theo han su dung (SRS 6.2)
export function statusAfterFailedRefund(expireAt: Date, now: Date): VoucherItemStatus {
  return new Date(expireAt).getTime() > now.getTime() ? VoucherItemStatus.ACTIVE : VoucherItemStatus.EXPIRED;
}
