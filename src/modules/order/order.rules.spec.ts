import { availableStock, isOnSale, refundableUntil, remainingPurchaseQuota, voucherCode } from './order.rules';
import {
  createPayosLink,
  newPaymentOrderCode,
  parsePayosWebhook,
  payosConfigured,
  payosCreateBody,
  payosSignData,
  signWebhook,
  verifyWebhook,
} from './payment-gateway';

const DAY = 24 * 60 * 60 * 1000;

describe('F09 - quy tac mua (order.rules)', () => {
  describe('remainingPurchaseQuota (BR-01)', () => {
    it('tinh ca voucher da phat hanh va don PENDING', () => {
      expect(remainingPurchaseQuota(5, 2, 1)).toBe(2);
    });
    it('khong am khi da vuot gioi han', () => {
      expect(remainingPurchaseQuota(5, 4, 3)).toBe(0);
    });
  });

  it('availableStock tru ca so da ban va dang giu cho (DC-03)', () => {
    expect(availableStock({ totalQuantity: 10, soldQuantity: 6, reservedQuantity: 3 })).toBe(1);
  });

  it('isOnSale chi dung trong khoang ngay ban', () => {
    const c = { saleStartAt: new Date('2026-10-01T00:00:00Z'), saleEndAt: new Date('2026-10-31T00:00:00Z') };
    expect(isOnSale(c, new Date('2026-10-15T00:00:00Z'))).toBe(true);
    expect(isOnSale(c, new Date('2026-09-30T23:59:59Z'))).toBe(false);
    expect(isOnSale(c, new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });

  describe('refundableUntil (BR-05)', () => {
    const paid = new Date('2026-10-20T03:00:00Z');
    it('han dung con xa: lay ngay mua + 7 ngay', () => {
      expect(refundableUntil(paid, new Date('2027-01-01T00:00:00Z')).getTime()).toBe(paid.getTime() + 7 * DAY);
    });
    it('han dung gan: lay han dung - 3 ngay', () => {
      const expire = new Date(paid.getTime() + 5 * DAY);
      expect(refundableUntil(paid, expire).getTime()).toBe(expire.getTime() - 3 * DAY);
    });
  });

  it('voucherCode co dang VC-XXXXXXXXXXXX', () => {
    expect(voucherCode(() => 'ab12cd34-ef56-7890-1234-567890abcdef')).toBe('VC-AB12CD34EF56');
  });
});

describe('F09 - cong thanh toan payOS (payment-gateway)', () => {
  const crypto = require('crypto');
  const sign = (data: string) => crypto.createHmac('sha256', 'test-checksum').update(data).digest('hex');

  beforeAll(() => {
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum';
    process.env.PAYOS_RETURN_URL = 'https://api.test/api/orders/payment-return';
    process.env.PAYOS_CANCEL_URL = 'https://api.test/api/orders/payment-return';
  });

  it('orderCode la so nguyen duy nhat trong gioi han 2^53', () => {
    const code = newPaymentOrderCode(1760000000000);
    expect(Number.isSafeInteger(Number(code))).toBe(true);
    expect(code.startsWith('1760000000000')).toBe(true);
  });

  it('than yeu cau tao link: so tien, het han dung reservedUntil, chu ky theo thu tu tham so payOS', () => {
    const body = payosCreateBody({ orderCode: '1760000000000123', amount: 80000, expiresAt: new Date('2026-10-20T03:15:00Z') });
    expect(body).toMatchObject({ orderCode: 1760000000000123, amount: 80000, expiredAt: 1792466100 });
    expect(body.description.length).toBeLessThanOrEqual(25);
    const data =
      `amount=80000&cancelUrl=${body.cancelUrl}&description=${body.description}` +
      `&orderCode=1760000000000123&returnUrl=${body.returnUrl}`;
    expect(body.signature).toBe(sign(data));
  });

  it('webhook payOS: chu ky dung -> ket qua; sua so tien hoac chu ky -> tu choi (BR-18)', () => {
    const data = { orderCode: 1760000000000123, amount: 80000, description: 'VC00000123', reference: 'FT123', code: '00', desc: 'success', currency: 'VND', counterAccountName: null };
    const body = { code: '00', desc: 'success', success: true, data, signature: sign(payosSignData(data)) };
    expect(parsePayosWebhook(body)).toMatchObject({ orderCode: '1760000000000123', gatewayTxnId: 'PAYOS-FT123', amount: 80000, success: true });
    expect(parsePayosWebhook({ ...body, data: { ...data, amount: 1 } })).toBeNull();
    expect(parsePayosWebhook({ ...body, signature: 'sai' })).toBeNull();
    // Chu ky dung nhung giao dich that bai
    const failed = { ...data, code: '01' };
    expect(parsePayosWebhook({ ...body, code: '01', data: failed, signature: sign(payosSignData(failed)) })?.success).toBe(false);
  });

  it('chua cau hinh khoa payOS thi khong goi API (dung che do gia lap)', async () => {
    delete process.env.PAYOS_CLIENT_ID;
    expect(payosConfigured()).toBe(false);
    await expect(createPayosLink({ orderCode: '1', amount: 1, expiresAt: new Date() })).resolves.toBeNull();
  });

  it('webhook JSON chung: chu ky dung moi duoc chap nhan', () => {
    const p = { orderId: 'o1', gatewayTxnId: 'T1', amount: 80000, status: 'SUCCESS' };
    expect(verifyWebhook({ ...p, signature: signWebhook(p) })).toBe(true);
    expect(verifyWebhook({ ...p, amount: 1, signature: signWebhook(p) })).toBe(false);
    expect(verifyWebhook({ ...p, signature: 'sai' })).toBe(false);
  });
});
