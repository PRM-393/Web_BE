import { VoucherItemStatus } from '../../common/enums/status.enum';
import { refundEligibility, statusAfterFailedRefund } from '../refund/refund.rules';
import { walletPlacement } from './wallet.rules';

const NOW = new Date('2026-10-21T07:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const future = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('walletPlacement: 4 tab cua vi (FR-REDEEM-01)', () => {
  it('ACTIVE con han -> tab dang hieu luc', () => {
    expect(walletPlacement({ status: VoucherItemStatus.ACTIVE, expireAt: future(5) }, NOW)).toEqual({
      tab: 'ACTIVE',
      displayStatus: VoucherItemStatus.ACTIVE,
      statusLabel: 'Đang hiệu lực',
    });
  });

  it('REFUND_PENDING nam o tab dang hieu luc voi nhan "Đang hoàn tiền", ke ca da qua han', () => {
    for (const expireAt of [future(5), future(-1)]) {
      expect(walletPlacement({ status: VoucherItemStatus.REFUND_PENDING, expireAt }, NOW)).toEqual({
        tab: 'ACTIVE',
        displayStatus: VoucherItemStatus.REFUND_PENDING,
        statusLabel: 'Đang hoàn tiền',
      });
    }
  });

  it('ACTIVE qua expireAt -> tab het han ngay, khong cho job', () => {
    expect(walletPlacement({ status: VoucherItemStatus.ACTIVE, expireAt: future(-0.001) }, NOW)).toMatchObject({
      tab: 'EXPIRED',
      displayStatus: VoucherItemStatus.EXPIRED,
    });
  });

  it.each([
    [VoucherItemStatus.USED, 'USED'],
    [VoucherItemStatus.EXPIRED, 'EXPIRED'],
    [VoucherItemStatus.REFUNDED, 'REFUNDED'],
  ])('%s -> tab %s', (status, tab) => {
    expect(walletPlacement({ status, expireAt: future(5) }, NOW).tab).toBe(tab);
  });
});

describe('refundEligibility (BR-05)', () => {
  const active = { status: VoucherItemStatus.ACTIVE, expireAt: future(30), refundableUntil: future(3) };

  it('du dieu kien', () => {
    expect(refundEligibility(active, false, NOW)).toMatchObject({ canRefund: true, reason: null });
  });

  it('qua refundableUntil -> bao kem han chot', () => {
    const r = refundEligibility({ ...active, refundableUntil: future(-1) }, false, NOW);
    expect(r).toMatchObject({ canRefund: false, reasonCode: 'REFUND_WINDOW_PASSED' });
    expect(r.reason).toContain('hạn chót');
  });

  it('dang co yeu cau xu ly -> khong cho gui them', () => {
    expect(refundEligibility(active, true, NOW).reasonCode).toBe('REFUND_IN_PROGRESS');
    expect(refundEligibility({ ...active, status: VoucherItemStatus.REFUND_PENDING }, false, NOW).reasonCode).toBe(
      'REFUND_IN_PROGRESS',
    );
  });

  it.each([
    [VoucherItemStatus.USED, 'VOUCHER_USED'],
    [VoucherItemStatus.REFUNDED, 'VOUCHER_REFUNDED'],
    [VoucherItemStatus.EXPIRED, 'VOUCHER_EXPIRED'],
  ])('%s -> %s', (status, code) => {
    expect(refundEligibility({ ...active, status }, false, NOW).reasonCode).toBe(code);
  });

  it('ACTIVE nhung qua expireAt -> het han', () => {
    expect(refundEligibility({ ...active, expireAt: future(-1) }, false, NOW).reasonCode).toBe('VOUCHER_EXPIRED');
  });

  it('hoan that bai: voucher ve ACTIVE neu con han, EXPIRED neu het han', () => {
    expect(statusAfterFailedRefund(future(1), NOW)).toBe(VoucherItemStatus.ACTIVE);
    expect(statusAfterFailedRefund(future(-1), NOW)).toBe(VoucherItemStatus.EXPIRED);
  });
});
