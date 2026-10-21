import { VoucherItemStatus, VoucherType } from '../../common/enums/status.enum';
import { buildQrPayload, newNonce, newOtp, verifyQrPayload } from './redeem-token';
import { billRequired, usageBlock } from './redeem.rules';

const NOW = new Date('2026-10-21T07:00:00Z');
const LATER = new Date('2026-12-31T00:00:00Z');

describe('ma QR redeem (FR-REDEEM-02, NFR-SEC-02, BR-16)', () => {
  const secret = 'test-secret';

  it('ky va kiem lai dung chu ky; ma khong chua id voucher', () => {
    const nonce = newNonce();
    const exp = new Date(NOW.getTime() + 60000);
    const payload = buildQrPayload(nonce, exp, secret);
    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload.split('.')).toHaveLength(4);
    expect(verifyQrPayload(payload, secret)).toEqual({ nonce, expiresAt: exp });
  });

  it('sua han dung, sua nonce, sai khoa hoac sai dinh dang deu bi tu choi', () => {
    const nonce = newNonce();
    const payload = buildQrPayload(nonce, new Date(NOW.getTime() + 60000), secret);
    const [v, n, exp, sig] = payload.split('.');
    expect(verifyQrPayload([v, n, String(Number(exp) + 600000), sig].join('.'), secret)).toBeNull();
    expect(verifyQrPayload([v, newNonce(), exp, sig].join('.'), secret)).toBeNull();
    expect(verifyQrPayload(payload, 'other-secret')).toBeNull();
    expect(verifyQrPayload('abc', secret)).toBeNull();
    expect(verifyQrPayload(`v2.${n}.${exp}.${sig}`, secret)).toBeNull();
    // dinh dang cu "voucherItemId.nonce.exp.sig" khong con hop le
    expect(verifyQrPayload(`99999999-0000-4000-8000-000000000001.${n}.${exp}.${sig}`, secret)).toBeNull();
  });

  it('OTP luon du 6 chu so', () => {
    for (let i = 0; i < 200; i++) expect(newOtp()).toMatch(/^\d{6}$/);
  });
});

describe('usageBlock: voucher co dung duoc khong', () => {
  it('ACTIVE con han thi dung duoc', () => {
    expect(usageBlock({ status: VoucherItemStatus.ACTIVE, expireAt: LATER }, NOW)).toBeNull();
  });

  it('ACTIVE qua expireAt thi het han ngay, khong cho job', () => {
    const block = usageBlock({ status: VoucherItemStatus.ACTIVE, expireAt: new Date(NOW.getTime() - 1000) }, NOW);
    expect(block?.reason).toBe('VOUCHER_EXPIRED');
    expect(block?.details?.expireAt).toBeTruthy();
  });

  it.each([
    [VoucherItemStatus.USED, 'VOUCHER_USED'],
    [VoucherItemStatus.REFUND_PENDING, 'VOUCHER_REFUND_PENDING'],
    [VoucherItemStatus.REFUNDED, 'VOUCHER_REFUNDED'],
    [VoucherItemStatus.EXPIRED, 'VOUCHER_EXPIRED'],
  ])('%s -> %s', (status, reason) => {
    expect(usageBlock({ status, expireAt: LATER }, NOW)?.reason).toBe(reason);
  });

  it('BR-03: chi voucher menh gia bat buoc nhap hoa don', () => {
    expect(billRequired(VoucherType.PREPAID, undefined)).toBe(true);
    expect(billRequired(VoucherType.PREPAID, 0)).toBe(false);
    expect(billRequired(VoucherType.DISCOUNT, undefined)).toBe(false);
    expect(billRequired(VoucherType.COMBO, null)).toBe(false);
  });
});
