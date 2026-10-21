// F10 - F12 - F15: vi voucher, ma redeem, xac nhan su dung, hoan tien, danh gia (e2e tren pg-mem)
//   npm run test:e2e
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { ID, TestApp, createTestApp } from './helpers/test-app';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { User } from '../src/entities/user.entity';
import { VoucherCampaign } from '../src/entities/voucher-campaign.entity';
import { CampaignStore } from '../src/entities/campaign-store.entity';
import { VoucherItem } from '../src/entities/voucher-item.entity';
import { RedeemToken } from '../src/entities/redeem-token.entity';
import { RedemptionLog } from '../src/entities/redemption-log.entity';
import { StaffAssignment } from '../src/entities/staff-assignment.entity';
import { AuditLog } from '../src/entities/audit-log.entity';
import { RefundRequest } from '../src/entities/refund-request.entity';
import { PaymentRefund } from '../src/entities/payment-refund.entity';
import { Review } from '../src/entities/review.entity';
import { Role } from '../src/common/enums/role.enum';
import {
  CampaignStatus,
  PaymentRefundStatus,
  RefundRequestStatus,
  ReviewStatus,
  VoucherItemStatus,
  VoucherType,
} from '../src/common/enums/status.enum';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe('F10/F11/F12/F15 - su dung voucher (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const users: Record<string, User> = {};
  let store2: string;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  async function newCustomer(name: string) {
    users[name] = await ds.getRepository(User).save({ email: `${name}@usage.local`, fullName: `Nguyễn Văn ${name}`, role: Role.CUSTOMER });
    tokens[name] = await t.customerToken(users[name].id, users[name].email);
  }

  async function newCampaign(title: string, voucherType = VoucherType.PREPAID, totalQuantity = 10) {
    const now = Date.now();
    const c = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title,
      voucherType,
      salePrice: 50000,
      faceValue: 100000,
      discountType: voucherType === VoucherType.DISCOUNT ? 'AMOUNT' : null,
      discountValue: voucherType === VoucherType.DISCOUNT ? 20000 : null,
      totalQuantity,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: 10,
      saleStartAt: new Date(now - DAY),
      saleEndAt: new Date(now + 30 * DAY),
      voucherExpireAt: new Date(now + 90 * DAY),
      status: CampaignStatus.PUBLISHED,
    } as Partial<VoucherCampaign>);
    await ds.getRepository(CampaignStore).save({ campaignId: c.id, storeId: ID.store1 });
    return c;
  }

  // Mua va thanh toan qua webhook co chu ky; tra ve cac voucher vua phat hanh
  async function buy(who: string, campaignId: string, quantity = 1) {
    const res = await t.http.post('/api/orders').set(auth(who)).send({ campaignId, quantity }).expect(201);
    const order = res.body.data.order;
    const p = { orderId: order.id, gatewayTxnId: `T-${crypto.randomUUID()}`, amount: Number(order.totalAmount), status: 'SUCCESS' };
    await t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) }).expect(200);
    return ds.getRepository(VoucherItem).find({ where: { orderId: order.id } });
  }

  const token = async (who: string, voucherItemId: string) =>
    (await t.http.post('/api/redeem/token').set(auth(who)).send({ voucherItemId }).expect(201)).body.data;

  const redeem = (body: Record<string, unknown>, who = 'staff') =>
    t.http.post('/api/redeem').set(auth(who)).send({ storeId: ID.store1, ...body });

  const selectStore = (storeId: string) =>
    t.http.post('/api/auth/select-store').set(auth('staff')).send({ storeId }).expect(201);

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret';
    t = await createTestApp();
    ds = t.dataSource;
    tokens.staff = await t.login('staff@highlands.local');
    tokens.owner = await t.login('owner@highlands.local');
    tokens.otherOwner = await t.login('owner@phuclong.local');
    tokens.admin = await t.login('admin@voucher.local');
    const staff = await ds.getRepository(User).findOneByOrFail({ email: 'staff@highlands.local' });
    const assignments = await ds.getRepository(StaffAssignment).find({ where: { userId: staff.id, active: true } });
    store2 = assignments.map((a) => a.storeId).find((s) => s !== ID.store1)!;
    await selectStore(ID.store1);
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  afterEach(() => {
    delete process.env.REFUND_MODE;
    delete process.env.REFUND_SANDBOX_RESULT;
  });

  // ================= F10 - vi =================

  describe('vi voucher (task 7)', () => {
    let items: VoucherItem[];

    beforeAll(async () => {
      await newCustomer('vi');
      await newCustomer('khac');
      const c = await newCampaign('Vi 4 tab');
      items = await buy('vi', c.id, 5);
      const repo = ds.getRepository(VoucherItem);
      await repo.update(items[1].id, { status: VoucherItemStatus.REFUND_PENDING });
      await repo.update(items[2].id, { expireAt: new Date(Date.now() - MINUTE) });
      await repo.update(items[3].id, { status: VoucherItemStatus.USED, usedAt: new Date() });
      await repo.update(items[4].id, { status: VoucherItemStatus.REFUNDED });
    });

    it('chia 4 tab; REFUND_PENDING o tab dang hieu luc voi nhan "Đang hoàn tiền"; het han xet theo expireAt', async () => {
      const active = (await t.http.get('/api/wallet?tab=ACTIVE').set(auth('vi')).expect(200)).body.data;
      expect(active.map((v: { id: string }) => v.id).sort()).toEqual([items[0].id, items[1].id].sort());
      const pending = active.find((v: { id: string }) => v.id === items[1].id);
      expect(pending).toMatchObject({ tab: 'ACTIVE', displayStatus: 'REFUND_PENDING', statusLabel: 'Đang hoàn tiền', canRedeem: false });
      expect(active.find((v: { id: string }) => v.id === items[0].id)).toMatchObject({ canRedeem: true, refund: { canRefund: true } });

      const expired = (await t.http.get('/api/wallet?tab=EXPIRED').set(auth('vi')).expect(200)).body.data;
      expect(expired).toHaveLength(1);
      expect(expired[0]).toMatchObject({ id: items[2].id, status: 'ACTIVE', displayStatus: 'EXPIRED' });

      const used = (await t.http.get('/api/wallet?tab=USED').set(auth('vi')).expect(200)).body.data;
      expect(used[0]).toMatchObject({ id: items[3].id, review: { canReview: true, hasReviewed: false } });
      const refunded = (await t.http.get('/api/wallet?tab=REFUNDED').set(auth('vi')).expect(200)).body.data;
      expect(refunded.map((v: { id: string }) => v.id)).toEqual([items[4].id]);

      const all = (await t.http.get('/api/wallet').set(auth('vi')).expect(200)).body.data;
      expect(all).toHaveLength(5);
      for (const v of all) {
        expect(v.secretKey).toBeUndefined();
        expect(v.campaign.brand.bankInfo).toBeUndefined();
      }
      await t.http.get('/api/wallet?tab=ALL').set(auth('vi')).expect(400);
    });

    it('chi tiet voucher da mua: kem chi nhanh ap dung; chi chu so huu xem duoc', async () => {
      const detail = (await t.http.get(`/api/wallet/${items[0].id}`).set(auth('vi')).expect(200)).body.data;
      expect(detail.stores.map((s: { id: string }) => s.id)).toEqual([ID.store1]);
      expect(detail).toMatchObject({ redemption: null, refundRequests: [], canRedeem: true });
      expect(detail.secretKey).toBeUndefined();

      await t.http.get(`/api/wallet/${items[0].id}`).set(auth('khac')).expect(404);
      await t.http.get(`/api/wallet/${crypto.randomUUID()}`).set(auth('vi')).expect(404);
      await t.http.get(`/api/wallet/${items[0].id}`).set(auth('staff')).expect(403);
    });
  });

  // ================= F10 - ma redeem =================

  describe('sinh ma redeem (task 8)', () => {
    let item: VoucherItem;

    beforeAll(async () => {
      await newCustomer('ma');
      [item] = await buy('ma', (await newCampaign('Ma QR')).id);
    });

    it('QR dang v1, khong chua id hay ma tra cuu voucher; OTP 6 so; han 60 giay', async () => {
      const tk = await token('ma', item.id);
      expect(tk.qrPayload).toMatch(/^v1\.[0-9a-f]{32}\.\d+\.[A-Za-z0-9_-]+$/);
      expect(tk.qrPayload).not.toContain(item.id);
      expect(tk.qrPayload).not.toContain(item.code);
      expect(tk.otpCode).toMatch(/^\d{6}$/);
      expect(tk.ttlSeconds).toBe(60);
      const ttl = new Date(tk.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(55_000);
      expect(ttl).toBeLessThanOrEqual(60_000);
    });

    it('sinh ma moi thi ma cu bi vo hieu (BR-06)', async () => {
      const first = await token('ma', item.id);
      await token('ma', item.id);
      const old = await redeem({ qrPayload: first.qrPayload, billAmount: 100000 }).expect(400);
      expect(old.body.error.reason).toBe('TOKEN_REVOKED');
    });

    it('chi chu so huu, voucher ACTIVE va chua het han', async () => {
      await newCustomer('nguoila');
      await t.http.post('/api/redeem/token').set(auth('nguoila')).send({ voucherItemId: item.id }).expect(404);

      const [expired, pending] = await buy('ma', (await newCampaign('Ma het han')).id, 2);
      await ds.getRepository(VoucherItem).update(expired.id, { expireAt: new Date(Date.now() - MINUTE) });
      await ds.getRepository(VoucherItem).update(pending.id, { status: VoucherItemStatus.REFUND_PENDING });
      const e = await t.http.post('/api/redeem/token').set(auth('ma')).send({ voucherItemId: expired.id }).expect(400);
      expect(e.body.error.reason).toBe('VOUCHER_EXPIRED');
      const p = await t.http.post('/api/redeem/token').set(auth('ma')).send({ voucherItemId: pending.id }).expect(400);
      expect(p.body.error.reason).toBe('VOUCHER_REFUND_PENDING');
    });

    it('toi da 10 lan / 10 phut, lan 11 bi 429 kem thoi gian thu lai', async () => {
      await newCustomer('spam');
      const [v] = await buy('spam', (await newCampaign('Spam ma')).id);
      for (let i = 0; i < 10; i++) await token('spam', v.id);
      const res = await t.http.post('/api/redeem/token').set(auth('spam')).send({ voucherItemId: v.id }).expect(429);
      expect(res.body.error.reason).toBe('TOKEN_RATE_LIMITED');
      expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

      // 10 phut sau thi tao lai duoc
      await ds.getRepository(RedeemToken).update({ voucherItemId: v.id }, { issuedAt: new Date(Date.now() - 11 * MINUTE) });
      await token('spam', v.id);
    });
  });

  // ================= F11 - xac nhan su dung =================

  describe('xac nhan su dung (task 11, 14)', () => {
    // Moi test mot khach rieng: moi khach chi duoc tao 10 ma / 10 phut (task 8)
    let n = 0;
    const fresh = async () => {
      const name = `dung${++n}`;
      await newCustomer(name);
      return name;
    };

    it('quet QR thanh cong; quet lai bao "da dung luc ... tai ..."; lich su ca co hoa don', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Tra dao')).id);
      const tk = await token(who, v.id);
      const ok = (await redeem({ qrPayload: tk.qrPayload, billAmount: 120000 }).expect(201)).body.data;
      expect(ok).toMatchObject({ voucherItemId: v.id, method: 'QR', billAmount: 120000, campaign: { title: 'Tra dao' } });
      expect(new Date(ok.billEditableUntil).getTime()).toBeGreaterThan(Date.now() + 9 * MINUTE);
      expect((await ds.getRepository(VoucherItem).findOneByOrFail({ id: v.id })).status).toBe(VoucherItemStatus.USED);

      const again = await redeem({ qrPayload: tk.qrPayload, billAmount: 120000 }).expect(400);
      expect(again.body.error.reason).toBe('VOUCHER_USED');
      expect(again.body.error.message).toContain('lúc');
      expect(again.body.error.details).toMatchObject({ storeId: ID.store1 });
      expect(again.body.error.details.storeName).toBeTruthy();

      const history = (await t.http.get('/api/redeem/history/today').set(auth('staff')).expect(200)).body.data;
      expect(history.find((h: { voucherItemId: string }) => h.voucherItemId === v.id)).toMatchObject({
        campaignTitle: 'Tra dao',
        billAmount: 120000,
        billEditable: true,
        method: 'QR',
      });
    });

    it('QR bi sua / gia / dinh dang cu bi tu choi; gui ca QR lan OTP bi tu choi', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('QR gia')).id);
      const tk = await token(who, v.id);
      const [ver, nonce, exp, sig] = tk.qrPayload.split('.');
      const tampered = await redeem({ qrPayload: [ver, nonce, String(Number(exp) + 600000), sig].join('.') }).expect(400);
      expect(tampered.body.error.reason).toBe('TOKEN_INVALID');
      const oldFormat = await redeem({ qrPayload: `${v.id}.${nonce}.${exp}.${sig}` }).expect(400);
      expect(oldFormat.body.error.reason).toBe('TOKEN_INVALID');
      const both = await redeem({ qrPayload: tk.qrPayload, otpCode: tk.otpCode }).expect(400);
      expect(both.body.error.reason).toBe('CODE_REQUIRED');
      // ma that van dung duoc sau cac lan thu sai
      await redeem({ otpCode: tk.otpCode, billAmount: 100000 }).expect(201);
    });

    it('ma het han 60 giay thi bao het han', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Het 60s')).id);
      const tk = await token(who, v.id);
      await ds.getRepository(RedeemToken).update({ otpCode: tk.otpCode, voucherItemId: v.id }, { expiresAt: new Date(Date.now() - 1000) });
      const res = await redeem({ otpCode: tk.otpCode, billAmount: 1 }).expect(400);
      expect(res.body.error.reason).toBe('TOKEN_EXPIRED');
    });

    it('sai chi nhanh: bao kem danh sach chi nhanh ap dung, ma da bi tieu (FR-REDEEM-13)', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Chi nhanh 1')).id);
      const tk = await token(who, v.id);
      await selectStore(store2);
      const wrong = await redeem({ storeId: store2, qrPayload: tk.qrPayload, billAmount: 1 }).expect(400);
      await selectStore(ID.store1);
      expect(wrong.body.error.reason).toBe('WRONG_STORE');
      expect(wrong.body.error.details.stores.map((s: { id: string }) => s.id)).toEqual([ID.store1]);
      const reuse = await redeem({ qrPayload: tk.qrPayload, billAmount: 1 }).expect(400);
      expect(reuse.body.error.reason).toBe('TOKEN_USED');
      expect((await ds.getRepository(VoucherItem).findOneByOrFail({ id: v.id })).status).toBe(VoucherItemStatus.ACTIVE);
    });

    it('chi nhanh trong yeu cau phai la chi nhanh dang chon trong phien', async () => {
      const res = await redeem({ storeId: store2, otpCode: '123456' }).expect(400);
      expect(res.body.error.reason).toBe('STORE_NOT_SELECTED');
    });

    it('BR-03: voucher menh gia thieu hoa don bi tu choi nhung ma CHUA bi tieu; voucher giam gia khong bat buoc', async () => {
      const who = await fresh();
      const [prepaid] = await buy(who, (await newCampaign('Menh gia')).id);
      const tk = await token(who, prepaid.id);
      const missing = await redeem({ otpCode: tk.otpCode }).expect(400);
      expect(missing.body.error).toMatchObject({ reason: 'BILL_REQUIRED', details: { voucherType: 'PREPAID', faceValue: 100000 } });
      await redeem({ otpCode: tk.otpCode, billAmount: 150000 }).expect(201);

      const [discount] = await buy(who, (await newCampaign('Giam gia', VoucherType.DISCOUNT)).id);
      const dt = await token(who, discount.id);
      const ok = await redeem({ otpCode: dt.otpCode }).expect(201);
      expect(ok.body.data.billAmount).toBeNull();
    });

    it('voucher dang cho hoan thi khong dung duoc', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Cho hoan')).id);
      const tk = await token(who, v.id);
      await ds.getRepository(VoucherItem).update(v.id, { status: VoucherItemStatus.REFUND_PENDING });
      const res = await redeem({ qrPayload: tk.qrPayload, billAmount: 1 }).expect(400);
      expect(res.body.error.reason).toBe('VOUCHER_REFUND_PENDING');
    });

    it('hai quay cung xac nhan mot ma: dung 1 lan thanh cong, khong ghi trung (BR-12)', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Dong thoi')).id);
      const tk = await token(who, v.id);
      const results = await Promise.all([
        redeem({ otpCode: tk.otpCode, billAmount: 1 }),
        redeem({ qrPayload: tk.qrPayload, billAmount: 1 }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(await ds.getRepository(RedemptionLog).count({ where: { voucherItemId: v.id } })).toBe(1);
    });

    it('sua hoa don trong 10 phut; qua 10 phut hoac nguoi khac thi khong duoc (FR-REDEEM-08)', async () => {
      const who = await fresh();
      const [v] = await buy(who, (await newCampaign('Sua hoa don')).id);
      const tk = await token(who, v.id);
      const ok = (await redeem({ otpCode: tk.otpCode, billAmount: 100000 }).expect(201)).body.data;
      const url = `/api/redeem/logs/${ok.redemptionLogId}/bill`;
      const updated = (await t.http.patch(url).set(auth('staff')).send({ billAmount: 135000 }).expect(200)).body.data;
      expect(updated).toMatchObject({ billAmount: 135000, billEditable: true });
      expect(updated.billUpdatedAt).toBeTruthy();

      tokens.staff2 = await t.login('staff@phuclong.local');
      await t.http.patch(url).set(auth('staff2')).send({ billAmount: 1 }).expect(404);
      await t.http.patch(url).set(auth('staff')).send({ billAmount: -5 }).expect(400);

      await ds.getRepository(RedemptionLog).update(ok.redemptionLogId, { redeemedAt: new Date(Date.now() - 11 * MINUTE) });
      const late = await t.http.patch(url).set(auth('staff')).send({ billAmount: 1 }).expect(400);
      expect(late.body.error.reason).toBe('BILL_EDIT_EXPIRED');
    });

    it('sai OTP 5 lan / 5 phut -> khoa nhap OTP 15 phut; QR van dung duoc (FR-REDEEM-12)', async () => {
      const who = await fresh();
      const [a, b] = await buy(who, (await newCampaign('Khoa OTP', VoucherType.DISCOUNT)).id, 2);
      const tk = await token(who, a.id);
      const wrong = tk.otpCode === '000000' ? '000001' : '000000';
      // Lui moc thoi gian cac lan sai / khoa ve 16 phut truoc = da het khoa
      const expireLock = () =>
        ds
          .getRepository(AuditLog)
          .createQueryBuilder()
          .update()
          .set({ createdAt: new Date(Date.now() - 16 * MINUTE) })
          .where('"action" IN (:...actions)', { actions: ['REDEEM_OTP_FAILED', 'REDEEM_OTP_LOCKED'] })
          .execute();
      try {
        for (let i = 1; i <= 4; i++) {
          const res = await redeem({ otpCode: wrong }).expect(400);
          expect(res.body.error).toMatchObject({ reason: 'OTP_INVALID', details: { remainingAttempts: 5 - i } });
        }
        const locked = await redeem({ otpCode: wrong }).expect(429);
        expect(locked.body.error.reason).toBe('OTP_LOCKED');
        expect(new Date(locked.body.error.details.lockedUntil).getTime()).toBeGreaterThan(Date.now() + 14 * MINUTE);
        // dung OTP cung bi chan trong luc khoa
        expect((await redeem({ otpCode: tk.otpCode }).expect(429)).body.error.reason).toBe('OTP_LOCKED');
        // QR khong bi khoa
        const qr = await token(who, b.id);
        await redeem({ qrPayload: qr.qrPayload }).expect(201);

        // 15 phut sau thi nhap OTP lai duoc
        await expireLock();
        await redeem({ otpCode: tk.otpCode }).expect(201);
      } finally {
        // khong de nhan vien bi khoa sang cac test sau
        await expireLock();
      }
    });
  });

  // ================= F12 - hoan tien =================

  describe('hoan tien (task 15, 16)', () => {
    const refund = (who: string, voucherItemId: string) =>
      t.http.post('/api/refunds').set(auth(who)).send({ voucherItemId, reason: 'Đổi kế hoạch' }).expect(201);

    beforeAll(async () => {
      await newCustomer('hoan');
    });

    it('thanh cong: REFUNDED, ghi PaymentRefund, cong refundedAmount, tra ton kho', async () => {
      const c = await newCampaign('Hoan thanh cong');
      const [v] = await buy('hoan', c.id);
      const res = (await refund('hoan', v.id)).body.data;
      expect(res).toMatchObject({ status: 'COMPLETED', amount: 50000, campaignTitle: 'Hoan thanh cong', voucherStatus: 'REFUNDED' });
      expect(res.paymentRefund).toMatchObject({ mode: 'AUTO', status: 'COMPLETED' });
      expect(res.paymentRefund.gatewayRefundId).toMatch(/^SBX-RF-/);
      expect((await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: c.id })).soldQuantity).toBe(0);

      const wallet = (await t.http.get(`/api/wallet/${v.id}`).set(auth('hoan')).expect(200)).body.data;
      expect(wallet).toMatchObject({ tab: 'REFUNDED', refund: { canRefund: false, reasonCode: 'VOUCHER_REFUNDED' } });
      expect(wallet.refundRequests[0]).toMatchObject({ status: 'COMPLETED' });
    });

    it('chien dich da ENDED thi khong tra ton kho', async () => {
      const c = await newCampaign('Da ket thuc');
      const [v] = await buy('hoan', c.id);
      await ds.getRepository(VoucherCampaign).update(c.id, { status: CampaignStatus.ENDED });
      expect((await refund('hoan', v.id)).body.data.status).toBe('COMPLETED');
      expect((await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: c.id })).soldQuantity).toBe(1);
    });

    it('cong tu choi: yeu cau FAILED, voucher ve ACTIVE, ghi giao dich hoan that bai', async () => {
      process.env.REFUND_SANDBOX_RESULT = 'declined';
      const [v] = await buy('hoan', (await newCampaign('Cong tu choi')).id);
      const res = (await refund('hoan', v.id)).body.data;
      expect(res).toMatchObject({ status: 'FAILED', voucherStatus: 'ACTIVE' });
      expect(res.rejectReason).toContain('từ chối');
      const failed = await ds.getRepository(PaymentRefund).find({ where: { status: PaymentRefundStatus.FAILED } });
      expect(failed.length).toBeGreaterThan(0);
    });

    it('cong tu choi khi voucher da qua han: voucher ve EXPIRED', async () => {
      process.env.REFUND_SANDBOX_RESULT = 'declined';
      const [v] = await buy('hoan', (await newCampaign('Tu choi het han')).id);
      await refund('hoan', v.id);
      // het han trong luc cho cong: tao lai tinh huong bang yeu cau dang xu ly roi danh dau that bai thu cong
      const [w] = await buy('hoan', (await newCampaign('Het han khi cho')).id);
      process.env.REFUND_MODE = 'manual';
      const pending = (await refund('hoan', w.id)).body.data;
      await ds.getRepository(VoucherItem).update(w.id, { expireAt: new Date(Date.now() - MINUTE) });
      await t.http.patch(`/api/refunds/${pending.id}/fail-manual`).set(auth('admin')).send({ reason: 'Tài khoản khách đã đóng' }).expect(200);
      expect((await ds.getRepository(VoucherItem).findOneByOrFail({ id: w.id })).status).toBe(VoucherItemStatus.EXPIRED);
    });

    it('cong khong phan hoi -> MANUAL_PENDING, voucher giu REFUND_PENDING (FR-REFUND-06)', async () => {
      process.env.REFUND_SANDBOX_RESULT = 'unavailable';
      const [v] = await buy('hoan', (await newCampaign('Cong loi')).id);
      const res = (await refund('hoan', v.id)).body.data;
      expect(res).toMatchObject({ status: 'MANUAL_PENDING', voucherStatus: 'REFUND_PENDING' });
      const wallet = (await t.http.get('/api/wallet?tab=ACTIVE').set(auth('hoan')).expect(200)).body.data;
      expect(wallet.find((w: { id: string }) => w.id === v.id)).toMatchObject({ statusLabel: 'Đang hoàn tiền', canRedeem: false });
    });

    it('khong du dieu kien: qua han hoan / dang co yeu cau xu ly -> REJECTED kem ly do', async () => {
      const [late, twice] = await buy('hoan', (await newCampaign('Khong du dk')).id, 2);
      await ds.getRepository(VoucherItem).update(late.id, { refundableUntil: new Date(Date.now() - MINUTE) });
      const r1 = (await refund('hoan', late.id)).body.data;
      expect(r1.status).toBe('REJECTED');
      expect(r1.rejectReason).toContain('quá hạn hoàn tiền');

      process.env.REFUND_MODE = 'manual';
      expect((await refund('hoan', twice.id)).body.data.status).toBe('MANUAL_PENDING');
      const r2 = (await refund('hoan', twice.id)).body.data;
      expect(r2).toMatchObject({ status: 'REJECTED' });
      expect(r2.rejectReason).toContain('đang có yêu cầu');
    });

    it('hang doi quan tri: xac nhan da hoan (bat buoc ma GD), khong hoan duoc, AuditLog, khach theo doi duoc', async () => {
      process.env.REFUND_MODE = 'manual';
      const [ok, ko] = await buy('hoan', (await newCampaign('Hang doi')).id, 2);
      const a = (await refund('hoan', ok.id)).body.data;
      const b = (await refund('hoan', ko.id)).body.data;

      const queue = (await t.http.get('/api/refunds/manual-pending').set(auth('admin')).expect(200)).body.data;
      const row = queue.find((q: { id: string }) => q.id === a.id);
      expect(row).toMatchObject({ amount: 50000, campaignTitle: 'Hang doi', customer: { email: 'hoan@usage.local' } });
      expect(row.payment.amount).toBe(100000);
      expect(row.customer.passwordHash).toBeUndefined();
      await t.http.get('/api/refunds/manual-pending').set(auth('staff')).expect(403);

      await t.http.patch(`/api/refunds/${a.id}/confirm-manual`).set(auth('admin')).send({ gatewayRefundId: ' ' }).expect(400);
      await t.http.patch(`/api/refunds/${a.id}/confirm-manual`).set(auth('admin')).send({ gatewayRefundId: 'VCB-123' }).expect(200);
      await t.http.patch(`/api/refunds/${a.id}/confirm-manual`).set(auth('admin')).send({ gatewayRefundId: 'VCB-123' }).expect(400);

      await t.http.patch(`/api/refunds/${b.id}/fail-manual`).set(auth('admin')).send({ reason: '' }).expect(400);
      await t.http.patch(`/api/refunds/${b.id}/fail-manual`).set(auth('admin')).send({ reason: 'Ngân hàng trả về lỗi' }).expect(200);
      expect((await ds.getRepository(VoucherItem).findOneByOrFail({ id: ko.id })).status).toBe(VoucherItemStatus.ACTIVE);

      const audits = await ds.getRepository(AuditLog).find({ where: [{ entityId: a.id }, { entityId: b.id }] });
      expect(audits.map((x) => x.action).sort()).toEqual(['CONFIRM_MANUAL_REFUND', 'FAIL_MANUAL_REFUND']);

      const mine = (await t.http.get('/api/refunds/me').set(auth('hoan')).expect(200)).body.data;
      expect(mine.find((m: { id: string }) => m.id === a.id)).toMatchObject({ status: 'COMPLETED', paymentRefund: { mode: 'MANUAL', gatewayRefundId: 'VCB-123' } });
      expect(mine.find((m: { id: string }) => m.id === b.id)).toMatchObject({ status: 'FAILED', rejectReason: 'Ngân hàng trả về lỗi' });
      expect((await ds.getRepository(RefundRequest).findOneByOrFail({ id: b.id })).status).toBe(RefundRequestStatus.FAILED);
    });

    it('DC-12: tong hoan khong vuot so tien da thanh toan', async () => {
      const [v] = await buy('hoan', (await newCampaign('DC12')).id);
      const order = await ds.getRepository(VoucherItem).findOneOrFail({ where: { id: v.id }, relations: ['order'] });
      const payment = (await ds.query('SELECT "id" FROM "payments" WHERE "orderId" = $1', [order.orderId]))[0];
      await ds.getRepository(PaymentRefund).save({
        paymentId: payment.id, amount: 50000, reasonType: 'MISMATCH', mode: 'MANUAL', status: PaymentRefundStatus.COMPLETED,
      } as Partial<PaymentRefund>);
      const res = (await refund('hoan', v.id)).body.data;
      expect(res.status).toBe('FAILED');
      expect(res.rejectReason).toContain('DC-12');
    });

    it('hang doi don lech so tien co ten chien dich va khach, khong lo mat khau', async () => {
      const list = (await t.http.get('/api/admin/payment-mismatches').set(auth('admin')).expect(200)).body.data;
      for (const o of list) expect(o.customer?.passwordHash).toBeUndefined();
    });
  });

  // ================= F15 - danh gia =================

  describe('danh gia (task 18)', () => {
    let campaign: VoucherCampaign;

    beforeAll(async () => {
      await newCustomer('review');
      await newCustomer('chuadung');
      campaign = await newCampaign('Danh gia', VoucherType.DISCOUNT);
      const [v] = await buy('review', campaign.id);
      await buy('chuadung', campaign.id);
      const tk = await token('review', v.id);
      await redeem({ otpCode: tk.otpCode }).expect(201);
    });

    it('chi khach co voucher USED duoc danh gia, 1 lan / chien dich (BR-10, DC-09)', async () => {
      const no = (await t.http.get(`/api/campaigns/${campaign.id}/reviews/eligibility`).set(auth('chuadung')).expect(200)).body.data;
      expect(no).toMatchObject({ canReview: false, reasonCode: 'REVIEW_NOT_ELIGIBLE' });
      const denied = await t.http.post('/api/reviews').set(auth('chuadung')).send({ campaignId: campaign.id, rating: 5 }).expect(400);
      expect(denied.body.error.reason).toBe('REVIEW_NOT_ELIGIBLE');

      const yes = (await t.http.get(`/api/campaigns/${campaign.id}/reviews/eligibility`).set(auth('review')).expect(200)).body.data;
      expect(yes.canReview).toBe(true);
      await t.http.post('/api/reviews').set(auth('review')).send({ campaignId: campaign.id, rating: 6 }).expect(400);
      const created = (await t.http.post('/api/reviews').set(auth('review')).send({ campaignId: campaign.id, rating: 4, comment: 'Ngon' }).expect(201)).body.data;
      expect(created).toMatchObject({ campaignId: campaign.id, rating: 4 });
      const twice = await t.http.post('/api/reviews').set(auth('review')).send({ campaignId: campaign.id, rating: 5 }).expect(400);
      expect(twice.body.error.reason).toBe('REVIEW_EXISTS');
      const after = (await t.http.get(`/api/campaigns/${campaign.id}/reviews/eligibility`).set(auth('review')).expect(200)).body.data;
      expect(after).toMatchObject({ canReview: false, reasonCode: 'REVIEW_EXISTS', reviewId: created.id });
    });

    it('danh sach cong khai (Guest xem duoc) co diem trung binh; ten nguoi danh gia duoc che', async () => {
      // them 1 danh gia 2 sao cua khach khac de kiem diem trung binh
      await newCustomer('review2');
      const [v] = await buy('review2', campaign.id);
      const tk = await token('review2', v.id);
      await redeem({ otpCode: tk.otpCode }).expect(201);
      await t.http.post('/api/reviews').set(auth('review2')).send({ campaignId: campaign.id, rating: 2 }).expect(201);

      const res = await t.http.get(`/api/campaigns/${campaign.id}/reviews?pageSize=1`).expect(200);
      expect(res.body.data).toMatchObject({ avgRating: 3, reviewCount: 2, total: 2 });
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(res.body.data.items[0].reviewerName).toBe('review2 N.');
      expect(res.body.data.items[0].userId).toBeUndefined();
    });

    it('thuong hieu phan hoi 1 lan, chi thuong hieu so huu; quan tri an danh gia -> diem trung binh doi, ghi AuditLog', async () => {
      const review = await ds.getRepository(Review).findOneByOrFail({ userId: users.review2.id });
      await t.http.patch(`/api/reviews/${review.id}/reply`).set(auth('otherOwner')).send({ reply: 'Xin lỗi' }).expect(403);
      await t.http.patch(`/api/reviews/${review.id}/reply`).set(auth('owner')).send({ reply: ' ' }).expect(400);
      await t.http.patch(`/api/reviews/${review.id}/reply`).set(auth('owner')).send({ reply: 'Xin lỗi bạn' }).expect(200);
      const again = await t.http.patch(`/api/reviews/${review.id}/reply`).set(auth('owner')).send({ reply: 'Lần 2' }).expect(400);
      expect(again.body.error.reason).toBe('REVIEW_ALREADY_REPLIED');

      await t.http.patch(`/api/admin/reviews/${review.id}/hide`).set(auth('owner')).send({ reason: 'x' }).expect(403);
      const hidden = (await t.http.patch(`/api/admin/reviews/${review.id}/hide`).set(auth('admin')).send({ reason: 'Ngôn từ không phù hợp' }).expect(200)).body.data;
      expect(hidden).toMatchObject({ status: ReviewStatus.HIDDEN, avgRating: 4, reviewCount: 1 });
      await t.http.patch(`/api/admin/reviews/${review.id}/hide`).set(auth('admin')).send({ reason: 'x' }).expect(400);

      const pub = (await t.http.get(`/api/campaigns/${campaign.id}/reviews`).expect(200)).body.data;
      expect(pub.items.map((r: { id: string }) => r.id)).not.toContain(review.id);
      const brandView = (await t.http.get(`/api/brands/${ID.brand}/reviews`).set(auth('owner')).expect(200)).body.data;
      expect(brandView.find((r: { id: string }) => r.id === review.id)).toMatchObject({ status: 'HIDDEN', campaignTitle: 'Danh gia' });

      const admin = (await t.http.get('/api/admin/reviews?status=HIDDEN').set(auth('admin')).expect(200)).body.data;
      expect(admin.items.map((r: { id: string }) => r.id)).toContain(review.id);
      expect(admin.items[0].brandName).toBeTruthy();

      await t.http.patch(`/api/admin/reviews/${review.id}/unhide`).set(auth('admin')).expect(200);
      const audits = await ds.getRepository(AuditLog).find({ where: { entityId: review.id } });
      expect(audits.map((a) => a.action).sort()).toEqual(['HIDE_REVIEW', 'UNHIDE_REVIEW']);
      expect(audits.find((a) => a.action === 'HIDE_REVIEW')?.detail).toEqual({ reason: 'Ngôn từ không phù hợp' });
    });

    it('vi: sau khi danh gia, voucher USED khong con nut danh gia', async () => {
      const used = (await t.http.get('/api/wallet?tab=USED').set(auth('review')).expect(200)).body.data;
      expect(used[0].review).toEqual({ hasReviewed: true, canReview: false });
    });
  });
});
