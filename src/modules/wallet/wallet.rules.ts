import { VoucherItemStatus } from '../../common/enums/status.enum';

// 4 tab cua vi (FR-REDEEM-01)
export const WALLET_TABS = ['ACTIVE', 'USED', 'EXPIRED', 'REFUNDED'] as const;
export type WalletTab = (typeof WALLET_TABS)[number];

export const WALLET_STATUS_LABELS: Record<VoucherItemStatus, string> = {
  [VoucherItemStatus.ACTIVE]: 'Đang hiệu lực',
  [VoucherItemStatus.REFUND_PENDING]: 'Đang hoàn tiền',
  [VoucherItemStatus.USED]: 'Đã sử dụng',
  [VoucherItemStatus.EXPIRED]: 'Hết hạn',
  [VoucherItemStatus.REFUNDED]: 'Đã hoàn tiền',
};

export interface WalletPlacement {
  tab: WalletTab;
  // trang thai hien thi: ACTIVE qua expireAt hien la EXPIRED ngay, khong cho job cap nhat
  displayStatus: VoucherItemStatus;
  statusLabel: string;
}

// REFUND_PENDING nam o tab "dang hieu luc" voi nhan "Đang hoàn tiền" (ke ca khi da qua han, vi dang cho hoan)
export function walletPlacement(item: { status: VoucherItemStatus; expireAt: Date }, now: Date): WalletPlacement {
  let tab: WalletTab;
  let displayStatus = item.status;
  switch (item.status) {
    case VoucherItemStatus.REFUND_PENDING:
      tab = 'ACTIVE';
      break;
    case VoucherItemStatus.ACTIVE:
      if (new Date(item.expireAt).getTime() > now.getTime()) {
        tab = 'ACTIVE';
      } else {
        tab = 'EXPIRED';
        displayStatus = VoucherItemStatus.EXPIRED;
      }
      break;
    case VoucherItemStatus.USED:
      tab = 'USED';
      break;
    case VoucherItemStatus.REFUNDED:
      tab = 'REFUNDED';
      break;
    default:
      tab = 'EXPIRED';
  }
  return { tab, displayStatus, statusLabel: WALLET_STATUS_LABELS[displayStatus] };
}
