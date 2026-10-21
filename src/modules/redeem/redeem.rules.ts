import { VoucherItemStatus, VoucherType } from '../../common/enums/status.enum';
import { formatVnDateTime } from '../../common/utils/vn-time';

export interface UsageBlock {
  reason: string;
  message: string;
  details: Record<string, unknown> | null;
}

// Voucher co dung duoc luc nay khong (sinh ma va xac nhan su dung). Het han xet theo expireAt, khong cho job.
// VOUCHER_USED chi tra ly do chung; RedeemService bo sung "luc nao, o dau" tu RedemptionLog.
export function usageBlock(item: { status: VoucherItemStatus; expireAt: Date }, now: Date): UsageBlock | null {
  switch (item.status) {
    case VoucherItemStatus.USED:
      return { reason: 'VOUCHER_USED', message: 'Voucher đã được sử dụng.', details: null };
    case VoucherItemStatus.REFUND_PENDING:
      return {
        reason: 'VOUCHER_REFUND_PENDING',
        message: 'Voucher đang chờ hoàn tiền nên không thể sử dụng.',
        details: null,
      };
    case VoucherItemStatus.REFUNDED:
      return { reason: 'VOUCHER_REFUNDED', message: 'Voucher đã được hoàn tiền, không còn hiệu lực.', details: null };
    default:
      break;
  }
  const expireAt = new Date(item.expireAt);
  if (item.status === VoucherItemStatus.EXPIRED || expireAt.getTime() <= now.getTime()) {
    return {
      reason: 'VOUCHER_EXPIRED',
      message: `Voucher đã hết hạn sử dụng lúc ${formatVnDateTime(expireAt)}.`,
      details: { expireAt: expireAt.toISOString() },
    };
  }
  return null;
}

// BR-03: voucher menh gia (tra truoc) bat buoc nhap gia tri hoa don khi xac nhan su dung
export function billRequired(voucherType: VoucherType, billAmount: number | null | undefined): boolean {
  return voucherType === VoucherType.PREPAID && (billAmount === null || billAmount === undefined);
}
