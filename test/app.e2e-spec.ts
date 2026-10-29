// Kiem thu e2e: chay toan bo AppModule tren PostgreSQL gia lap (pg-mem), nap database/postgres/schema.sql + seed.sql
// roi goi API qua HTTP nhu client that. Bat duoc ca loi dang ky module / entity ma tsc khong thay.
//   npm run test:e2e
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { corsOrigin } from '../src/config/cors';
import { DataSource, IsNull } from 'typeorm';
import { Payment } from '../src/entities/payment.entity';
import { RefreshToken } from '../src/entities/refresh-token.entity';
import { OtpCode } from '../src/entities/otp-code.entity';
import { VoucherItem } from '../src/entities/voucher-item.entity';
import { RefundRequest } from '../src/entities/refund-request.entity';
import { Order } from '../src/entities/order.entity';
import { UserStatus, CampaignStatus, OrderStatus, PaymentStatus, VoucherItemStatus, RefundRequestStatus } from '../src/common/enums/status.enum';
import { User } from '../src/entities/user.entity';
import { VoucherCampaign } from '../src/entities/voucher-campaign.entity';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { RedeemService } from '../src/modules/redeem/redeem.service';
import { ID, PASSWORD, SentMail, createTestApp } from './helpers/test-app';

describe('Web_BE e2e (pg-mem)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const token: Record<string, string> = {};
  let emails: SentMail[] = [];
  let ds: DataSource;

  const auth = (role: string) => ({ Authorization: `Bearer ${token[role]}` });

  beforeAll(async () => {
    const t = await createTestApp();
    app = t.app;
    http = t.http;
    ds = t.dataSource;
    emails = t.emails;
    await ds.getRepository(VoucherCampaign).update(ID.campPublished, { saleStartAt: new Date(Date.now() - 86400000), saleEndAt: new Date(Date.now() + 30 * 86400000), voucherExpireAt: new Date(Date.now() + 60 * 86400000) });
    token.owner = await t.login('owner@highlands.local');
    token.staff = await t.login('staff@highlands.local');
    token.admin = await t.login('admin@voucher.local');
    // khach dang nhap that bang email + mat khau (seed: Voucher@123)
    token.customer = await t.login('khach@voucher.local');
    // FR-AUTH-12: nhan vien chon chi nhanh lam viec truoc khi redeem
    await http.post('/api/auth/select-store').set(auth('staff')).send({ storeId: ID.store1 }).expect(201);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('health check cho Render: API va CSDL deu song', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('CORS: cho phep localhost:5173 va *.vercel.app, chan ten mien la', () => {
    const check = corsOrigin('http://localhost:5173,https://*.vercel.app') as (o: string | undefined, cb: (e: Error | null, ok?: boolean) => void) => void;
    const allowed = (o?: string) => { let r = false; check(o, (_e, ok) => (r = !!ok)); return r; };
    expect(allowed('http://localhost:5173')).toBe(true);
    expect(allowed('https://voucher-platform-web.vercel.app')).toBe(true);
    expect(allowed('https://evil.com')).toBe(false);
    expect(allowed('https://a.b.vercel.app.evil.com')).toBe(false);
    expect(allowed(undefined)).toBe(true);
    expect(corsOrigin('')).toBe(true);
  });

  it('F01: phan hoi thong nhat { data, error, meta }; danh sach phan trang co meta; loi co error.message', async () => {
    const ok = await http.get('/api/vouchers').query({ pageSize: 2 }).expect(200);
    expect(ok.body.error).toBeNull();
    expect(ok.body.data.items.length).toBeLessThanOrEqual(2);
    expect(ok.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(ok.body.meta.totalPages).toBeGreaterThanOrEqual(1);

    const noAuth = await http.get('/api/wallet').expect(401);
    expect(noAuth.body.data).toBeNull();
    expect(noAuth.body.error).toMatchObject({ code: 401, path: '/api/wallet' });
    expect(typeof noAuth.body.error.message).toBe('string');

    // loi validation nhieu dong gop thanh mot chuoi
    const bad = await http.post('/api/auth/login').send({ email: 'khong-phai-email', password: '1' }).expect(400);
    expect(bad.body.error.message.split('\n').length).toBeGreaterThan(1);
  });

  it('dang nhap sai mat khau tra 401', async () => {
    await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: 'sai-mat-khau' }).expect(401);
  });

  it('chan sai vai tro: nhan vien goi API quan tri bi 403 (NFR-SEC-03)', async () => {
    await http.get('/api/admin/dashboard').set(auth('staff')).expect(403);
  });

  it('chu thuong hieu xem ho so, chi nhanh, nhan vien', async () => {
    const me = await http.get('/api/brands/me').set(auth('owner')).expect(200);
    expect(me.body.data[0].name).toBe('Highlands Coffee');
    const stores = await http.get(`/api/brands/${ID.brand}/stores`).set(auth('owner')).expect(200);
    expect(stores.body.data).toHaveLength(2);
    const staff = await http.get(`/api/brands/${ID.brand}/staff`).set(auth('owner')).expect(200);
    expect(staff.body.data).toHaveLength(2);
    expect(staff.body.data[0].email).toBe('staff@highlands.local');
  });

  it('tao chien dich: bat FR-CAMP-12 va luu dung truong gia tri', async () => {
    const base = {
      title: 'Giam 30% tra sua',
      voucherType: 'DISCOUNT',
      salePrice: 10000,
      faceValue: 50000,
      totalQuantity: 50,
      saleStartAt: '2026-11-01T00:00:00.000Z',
      saleEndAt: '2026-11-30T00:00:00.000Z',
      voucherExpireAt: '2026-12-31T00:00:00.000Z',
      storeIds: [ID.store1],
    };
    // giam theo % ma thieu muc giam toi da
    await http
      .post(`/api/campaigns/brand/${ID.brand}`)
      .set(auth('owner'))
      .send({ ...base, discountType: 'PERCENT', discountValue: 30 })
      .expect(400);
    // ten loai cu khong con hop le
    await http.post(`/api/campaigns/brand/${ID.brand}`).set(auth('owner')).send({ ...base, voucherType: 'DISCOUNT_CODE' }).expect(400);

    const created = await http
      .post(`/api/campaigns/brand/${ID.brand}`)
      .set(auth('owner'))
      .send({ ...base, discountType: 'PERCENT', discountValue: 30, maxDiscount: 20000 })
      .expect(201);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.discountType).toBe('PERCENT');

    await http.patch(`/api/campaigns/${created.body.data.id}/submit`).set(auth('owner')).expect(200);
    const pending = await http.get('/api/admin/pending/campaigns').set(auth('admin')).expect(200);
    expect(pending.body.data.map((c: { id: string }) => c.id)).toContain(created.body.data.id);

    const approved = await http.patch(`/api/campaigns/${created.body.data.id}/approve`).set(auth('admin')).expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.approvedBy).toBeTruthy();
    expect(approved.body.data.submittedAt).toBeTruthy();
  });

  it('tim kiem chien dich dang ban theo tu khoa (khong phan biet hoa thuong)', async () => {
    const res = await http.get('/api/vouchers').query({ keyword: 'VOUCHER' }).expect(200);
    const items = res.body.data.items;
    expect(items.map((c: { id: string }) => c.id)).toContain(ID.campPublished);
  });

  it('tim kiem khong dau: "phuc long" va "Phúc Long" ra cung ket qua (FR-SEARCH-01)', async () => {
    const plain = await http.get('/api/vouchers').query({ keyword: 'phuc long' }).expect(200);
    const accented = await http.get('/api/vouchers').query({ keyword: 'Phúc Long' }).expect(200);
    expect(plain.body.data.total).toBeGreaterThan(0);
    expect(plain.body.data.items.map((c: { id: string }) => c.id)).toEqual(accented.body.data.items.map((c: { id: string }) => c.id));
    const dong = await http.get('/api/vouchers').query({ keyword: 'tra sua' }).expect(200);
    expect(dong.body.data.items.some((c: { title: string }) => c.title.includes('Trà sữa'))).toBe(true);
  });

  it('vi cua khach khong lo secretKey (NFR-SEC-05)', async () => {
    const res = await http.get('/api/wallet').set(auth('customer')).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].secretKey).toBeUndefined();
    expect(res.body.data[0].refundableUntil).toBeTruthy();
  });

  it('xac nhan su dung bang OTP: token cu bi vo hieu, dung mot lan (BR-06, BR-07)', async () => {
    const redeem = app.get(RedeemService);
    const first = await redeem.requestToken(ID.customer, { voucherItemId: ID.voucher });
    const second = await redeem.requestToken(ID.customer, { voucherItemId: ID.voucher });

    const stores = await http.get('/api/redeem/my-stores').set(auth('staff')).expect(200);
    expect(stores.body.data).toHaveLength(2);

    const old = await http.post('/api/redeem').set(auth('staff')).send({ storeId: ID.store1, otpCode: first.otpCode });
    if (first.otpCode !== second.otpCode) expect(old.status).toBe(400);

    const ok = await http
      .post('/api/redeem')
      .set(auth('staff'))
      .send({ storeId: ID.store1, otpCode: second.otpCode, billAmount: 95000 })
      .expect(201);
    expect(ok.body.data.voucherItemId).toBe(ID.voucher);

    await http.post('/api/redeem').set(auth('staff')).send({ storeId: ID.store1, otpCode: second.otpCode }).expect(400);
    const history = await http.get('/api/redeem/history/today').set(auth('staff')).expect(200);
    expect(history.body.data).toHaveLength(1);
  });

  it('chot doi soat theo tung voucher, dung ty le da chot vao don (BR-09, BR-14)', async () => {
    const run = await http
      .post('/api/admin/settlements/run')
      .set(auth('admin'))
      .send({ periodStart: '2026-09-30T17:00:00.000Z', periodEnd: '2026-10-31T16:59:59.000Z' })
      .expect(201);
    expect(run.body.data).toHaveLength(1);
    expect(run.body.data[0].voucherCount).toBe(1);
    expect(Number(run.body.data[0].commissionAmount)).toBe(8000);
    expect(Number(run.body.data[0].payableAmount)).toBe(72000);

    // chay lai khong sinh trung (DC-06)
    const again = await http
      .post('/api/admin/settlements/run')
      .set(auth('admin'))
      .send({ periodStart: '2026-09-30T17:00:00.000Z', periodEnd: '2026-10-31T16:59:59.000Z' })
      .expect(201);
    expect(again.body.data).toHaveLength(0);

    const list = await http.get('/api/admin/settlements').set(auth('admin')).expect(200);
    expect(list.body.data[0].brandName).toBe('Highlands Coffee');
  });

  it('danh gia: mot lan moi chien dich, thuong hieu phan hoi (DC-09, FR-ENGAGE-04)', async () => {
    const created = await http
      .post('/api/reviews')
      .set(auth('customer'))
      .send({ voucherItemId: ID.voucher, rating: 5, comment: 'Ngon' })
      .expect(201);
    expect(created.body.data.campaignId).toBe(ID.campPublished);
    await http.post('/api/reviews').set(auth('customer')).send({ voucherItemId: ID.voucher, rating: 4 }).expect(400);

    const list = await http.get(`/api/brands/${ID.brand}/reviews`).set(auth('owner')).expect(200);
    expect(list.body.data).toHaveLength(1);
    const replied = await http
      .patch(`/api/reviews/${created.body.data.id}/reply`)
      .set(auth('owner'))
      .send({ reply: 'Cam on ban!' })
      .expect(200);
    expect(replied.body.data.brandRepliedAt).toBeTruthy();
  });

  it('bang dieu khien quan tri', async () => {
    const res = await http.get('/api/admin/dashboard').set(auth('admin')).expect(200);
    expect(res.body.data.totalActiveBrands).toBe(5); // seed co 5 thuong hieu APPROVED (Circle K con PENDING)
  });

  // Dat cuoi file: test nay doi ty le hoa hong chung va tao them mot don, nen phai chay sau
  // cac test doi soat / bang dieu khien vo so lieu seed.
  it('doi ty le hoa hong: don sau mang ty le moi, don cu giu ty le da chot (FR-SETTLE-01, BR-09)', async () => {
    const before = await http.get('/api/admin/commission-rate').set(auth('admin')).expect(200);
    expect(Number(before.body.data.rate)).toBe(0.1);
    expect(before.body.data.isDefault).toBe(false);

    // Chi nhan khoang mo 0 < rate < 1
    for (const rate of [0, 1, 1.5, -0.1, 'muoi phan tram']) {
      await http.post('/api/admin/commission-rate').set(auth('admin')).send({ rate }).expect(400);
    }
    const unchanged = await http.get('/api/admin/commission-rate').set(auth('admin')).expect(200);
    expect(Number(unchanged.body.data.rate)).toBe(0.1);

    // Chi quan tri vien duoc doi (NFR-SEC-03)
    await http.post('/api/admin/commission-rate').set(auth('owner')).send({ rate: 0.25 }).expect(403);

    await http.post('/api/admin/commission-rate').set(auth('admin')).send({ rate: 0.25 }).expect(201);
    const after = await http.get('/api/admin/commission-rate').set(auth('admin')).expect(200);
    expect(Number(after.body.data.rate)).toBe(0.25);
    expect(after.body.data.updatedAt).toBeTruthy();

    // Don thanh toan sau khi doi ty le phai chot 0.25
    const created = await http
      .post('/api/orders')
      .set(auth('customer'))
      .send({ campaignId: ID.campPublished, quantity: 1 })
      .expect(201);
    const newOrderId = created.body.data.order.id as string;
    const paid = { orderId: newOrderId, gatewayTxnId: 'txn-doi-ty-le-1', amount: Number(created.body.data.order.totalAmount), status: 'SUCCESS' };
    await http
      .post('/api/orders/payment-webhook')
      .send({ ...paid, signature: signWebhook(paid), raw: {} })
      .expect(200);

    const orders = await http.get('/api/orders/me').set(auth('customer')).expect(200);
    const newOrder = orders.body.data.find((o: any) => o.id === newOrderId);
    const seededOrder = orders.body.data.find((o: any) => o.id === '77777777-0000-4000-8000-000000000001');
    expect(newOrder.status).toBe('FULFILLED');
    expect(Number(newOrder.commissionRate)).toBe(0.25);
    // Don cu khong bi ty le moi anh huong (BR-09)
    expect(Number(seededOrder.commissionRate)).toBe(0.1);

    // Don dung cho test nay khong duoc lam lech so lieu bao cao / hoan tien cua cac test sau
    await ds.getRepository(VoucherItem).delete({ orderId: newOrderId });
    await ds.getRepository(Payment).delete({ orderId: newOrderId });
    await ds.getRepository(Order).delete({ id: newOrderId });
    await ds.getRepository(VoucherCampaign).decrement({ id: ID.campPublished }, 'soldQuantity', 1);
  });
  it('refresh rotates once, logout revokes both access and refresh', async () => {
    const session = (await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: PASSWORD, deviceId: 'test-device' }).expect(201)).body.data;
    const next = (await http.post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(201)).body.data;
    expect(next.refreshToken).not.toBe(session.refreshToken);
    await http.post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    const headers = { Authorization: 'Bearer ' + next.accessToken };
    await http.get('/api/brands/me').set(headers).expect(200);
    await http.post('/api/auth/logout').set(headers).expect(201);
    await http.get('/api/brands/me').set(headers).expect(401);
    await http.post('/api/auth/refresh').send({ refreshToken: next.refreshToken }).expect(401);
    const stored = await ds.getRepository(RefreshToken).findOneByOrFail({ deviceId: 'test-device' });
    expect(stored.tokenHash).not.toBe(next.refreshToken);
    expect(stored.revokedAt).toBeTruthy();
  });

  it('inactive account is rejected immediately, including refresh and OTP', async () => {
    const session = (await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: PASSWORD }).expect(201)).body.data;
    const owner = await ds.getRepository(User).findOneByOrFail({ email: 'owner@highlands.local' });
    await ds.getRepository(User).update(owner.id, { status: UserStatus.INACTIVE });
    try {
      await http.get('/api/brands/me').set({ Authorization: 'Bearer ' + session.accessToken }).expect(401);
      await http.post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      await http.post('/api/auth/login').send({ email: owner.email, password: PASSWORD }).expect(401);
    } finally { await ds.getRepository(User).update(owner.id, { status: UserStatus.ACTIVE }); }
    await ds.getRepository(User).update(ID.customer, { status: UserStatus.INACTIVE });
    try { await http.post('/api/auth/login').send({ email: 'khach@voucher.local', password: PASSWORD }).expect(401); }
    finally { await ds.getRepository(User).update(ID.customer, { status: UserStatus.ACTIVE }); }
  });

  it('FR-AUTH-01 khach: kiem tra email -> dang ky bang mat khau (khong can xac thuc) -> dang nhap', async () => {
    const email = 'new-customer@example.com';
    expect((await http.post('/api/auth/check-email').send({ email }).expect(201)).body.data.registered).toBe(false);
    await http.post('/api/auth/register').send({ email, password: '123' }).expect(400);
    const created = await http.post('/api/auth/register').send({ email: 'New-Customer@Example.com', password: 'matkhau1', fullName: 'Khach Moi' }).expect(201);
    expect(created.body.data.accessToken).toBeTruthy();
    expect(created.body.data.user).toMatchObject({ email, role: 'CUSTOMER', fullName: 'Khach Moi' });
    expect((await http.post('/api/auth/check-email').send({ email }).expect(201)).body.data.registered).toBe(true);
    await http.post('/api/auth/register').send({ email, password: 'matkhau2' }).expect(409);
    const user = await ds.getRepository(User).findOneByOrFail({ email });
    expect(user.passwordHash).not.toBe('matkhau1');
    const session = await http.post('/api/auth/login').send({ email, password: 'matkhau1' }).expect(201);
    expect(session.body.data.user.role).toBe('CUSTOMER');
    await http.post('/api/auth/login').send({ email, password: 'sai-mat-khau' }).expect(401);
    // email cua nhan vien da co mat khau: khong dang ky lai duoc
    await http.post('/api/auth/register').send({ email: 'staff@highlands.local', password: 'matkhau1' }).expect(409);
    expect(emails.some((m) => m.to === email)).toBe(false);
  });

  it('FR-AUTH-09 quen mat khau: ma 6 so qua email, dung mot lan, doi xong thu hoi moi phien', async () => {
    const email = 'forgot@example.com';
    const old = (await http.post('/api/auth/register').send({ email, password: 'matkhau-cu' }).expect(201)).body.data;
    const before = emails.length;
    await http.post('/api/auth/password-reset/code-request').send({ email: 'chua-dang-ky@example.com' }).expect(201);
    expect(emails.length).toBe(before);
    await http.post('/api/auth/password-reset/code-request').send({ email }).expect(201);
    const code = emails[emails.length - 1].text.match(/\b\d{6}\b/)![0];
    const record = await ds.getRepository(OtpCode).findOneByOrFail({ email, usedAt: IsNull() });
    expect(record.codeHash).not.toBe(code);
    const wrong = code === '111111' ? '222222' : '111111';
    await http.post('/api/auth/password-reset/code-confirm').send({ email, code: wrong, password: 'matkhau-moi' }).expect(400);
    await http.post('/api/auth/password-reset/code-confirm').send({ email, code, password: 'matkhau-moi' }).expect(201);
    await http.post('/api/auth/password-reset/code-confirm').send({ email, code, password: 'matkhau-khac' }).expect(400);
    await http.post('/api/auth/refresh').send({ refreshToken: old.refreshToken }).expect(401);
    await http.post('/api/auth/login').send({ email, password: 'matkhau-cu' }).expect(401);
    await http.post('/api/auth/login').send({ email, password: 'matkhau-moi' }).expect(201);
  });

  it('FR-AUTH-09 ma dat lai: sai 5 lan thi huy ma, gioi han 5 lan gui moi gio', async () => {
    const email = 'reset-limit@example.com';
    await http.post('/api/auth/register').send({ email, password: 'matkhau1' }).expect(201);
    await http.post('/api/auth/password-reset/code-request').send({ email }).expect(201);
    const code = emails[emails.length - 1].text.match(/\b\d{6}\b/)![0];
    const wrong = code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await http.post('/api/auth/password-reset/code-confirm').send({ email, code: wrong, password: 'matkhau2' }).expect(400);
    await http.post('/api/auth/password-reset/code-confirm').send({ email, code, password: 'matkhau2' }).expect(400);
    for (let i = 0; i < 4; i++) await http.post('/api/auth/password-reset/code-request').send({ email }).expect(201);
    await http.post('/api/auth/password-reset/code-request').send({ email }).expect(429);
    await ds.getRepository(OtpCode).update({ email }, { createdAt: new Date(Date.now() - 3600001) });
    await http.post('/api/auth/password-reset/code-request').send({ email }).expect(201);
  });

  it('activation sets password, expires and is one-use', async () => {
    const user = await ds.getRepository(User).save(ds.getRepository(User).create({
      email: 'pending@example.com', role: 'STORE_STAFF' as any, status: UserStatus.PENDING_ACTIVATION,
    }));
    await http.post('/api/auth/activation/request').send({ email: user.email }).expect(201);
    const activation = new URL(emails[emails.length - 1].text.match(/https?:\/\/\S+/)![0]);
    const body = { email: user.email, token: new URLSearchParams(activation.hash.split('?')[1]).get('token'), password: PASSWORD };
    await http.post('/api/auth/activate').send(body).expect(201);
    await http.post('/api/auth/activate').send(body).expect(400);
    await http.post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(201);
  });

  it('tenant isolation protects reports, campaigns, stores and settlements', async () => {
    const otherBrand = '33333333-0000-4000-8000-000000000002';
    await http.get('/api/brands/' + otherBrand + '/report').set(auth('owner')).expect(403);
    await http.get('/api/campaigns/brand/' + otherBrand).set(auth('owner')).expect(403);
    await http.get('/api/brands/' + otherBrand + '/stores').set(auth('owner')).expect(403);
    await http.get('/api/brands/' + otherBrand + '/settlements').set(auth('owner')).expect(403);
    await http.get('/api/brands/' + ID.brand + '/report').query({ from: 'bad-date' }).set(auth('owner')).expect(400);
    await http.get('/api/brands/' + ID.brand + '/report').query({ from: '2026-11-01', to: '2026-10-01' }).set(auth('owner')).expect(400);
    const report = await http.get('/api/brands/' + ID.brand + '/report').set(auth('owner')).expect(200);
    expect(report.body.data.totalVoucherUsed).toBe(1);
    expect(report.body.data.totalRevenue).toBe(80000);
    expect(report.body.data.usageRate).toBe(100);
  });

  it('search finds brand names, uses campaign categories and includes sold-out', async () => {
    const repo = ds.getRepository(VoucherCampaign);
    const original = await repo.findOneByOrFail({ id: ID.campPublished });
    const categoryId = '11111111-0000-4000-8000-000000000003';
    await repo.update(original.id, { categoryId, status: CampaignStatus.SOLD_OUT });
    try {
      const response = await http.get('/api/vouchers').query({ keyword: 'highlands', categoryId }).expect(200);
      expect(response.body.data.items.map((c: any) => c.id)).toContain(original.id);
      const item = response.body.data.items.find((c: any) => c.id === original.id);
      expect(item.soldOut).toBe(true);
      expect(item.canPurchase).toBe(false);
      expect(item.brand.bankInfo).toBeUndefined();
      await http.get('/api/vouchers').query({ minPrice: 100, maxPrice: 10 }).expect(400);
      await http.get('/api/vouchers').query({ pageSize: 101 }).expect(400);
      await http.get('/api/vouchers').query({ minDiscount: 10, sort: 'discount_desc' }).expect(200);
    } finally { await repo.update(original.id, { categoryId: original.categoryId, status: original.status }); }
  });

  it('nearby filters before pagination and detail hides drafts', async () => {
    const stores = await http.get('/api/brands/' + ID.brand + '/stores').set(auth('owner')).expect(200);
    const { latitude: lat, longitude: lng } = stores.body.data[0];
    const nearby = await http.get('/api/vouchers').query({ lat, lng, radiusKm: 1, sort: 'distance_asc' }).expect(200);
    expect(nearby.body.data.items.map((c: any) => c.id)).toContain(ID.campPublished);
    expect(nearby.body.data.items.find((c: any) => c.id === ID.campPublished).distanceKm).toBeCloseTo(0);
    const far = await http.get('/api/vouchers').query({ lat: 0, lng: 0, radiusKm: 1 }).expect(200);
    expect(far.body.data.items).toHaveLength(0);
    const denied = await http.get('/api/vouchers').query({ locationDenied: true, radiusKm: 1 }).expect(200);
    expect(denied.body.data.locationDenied).toBe(true);
    await http.get('/api/vouchers').query({ lat: 10 }).expect(400);
    await http.get('/api/vouchers').query({ lat: 91, lng: 10 }).expect(400);
    await http.get('/api/vouchers').query({ lat: 10, lng: 10, radiusKm: 2 }).expect(400);
    await http.get('/api/vouchers/66666666-0000-4000-8000-000000000002').expect(404);
    const detail = await http.get('/api/vouchers/' + ID.campPublished).query({ lat, lng }).expect(200);
    expect(detail.body.data.stores).toHaveLength(2);
    expect(detail.body.data.refundPolicy.windowDays).toBe(7);
    expect(detail.body.data.reviewCount).toBe(1);
    expect(detail.body.data.averageRating).toBe(5);
    expect(detail.body.data.brand.bankInfo).toBeUndefined();
  });

  it('manual queue records received amount, audit, and cannot confirm twice', async () => {
    const source = await ds.getRepository(Order).findOneByOrFail({ userId: ID.customer });
    const order = await ds.getRepository(Order).save(ds.getRepository(Order).create({
      ...source, id: crypto.randomUUID(), status: OrderStatus.PAYMENT_MISMATCH, refundedAmount: 0,
    }));
    await ds.getRepository(Payment).save(ds.getRepository(Payment).create({
      orderId: order.id, gateway: 'SANDBOX', gatewayTxnId: crypto.randomUUID(), amount: 70000, status: PaymentStatus.SUCCESS,
    }));
    const queue = await http.get('/api/admin/payment-mismatches').set(auth('admin')).expect(200);
    expect(queue.body.data.find((o: any) => o.id === order.id).payments[0].amount).toBe(70000);
    const url = '/api/admin/payment-mismatches/' + order.id + '/confirm-refund';
    await http.patch(url).set(auth('staff')).send({ gatewayRefundId: 'test-manual' }).expect(403);
    await http.patch(url).set(auth('admin')).send({ gatewayRefundId: ' ' }).expect(400);
    await http.patch(url).set(auth('admin')).send({ gatewayRefundId: 'test-manual' }).expect(200);
    await http.patch(url).set(auth('admin')).send({ gatewayRefundId: 'test-manual' }).expect(400);
    const updated = await ds.getRepository(Order).findOneByOrFail({ id: order.id });
    expect(updated.status).toBe(OrderStatus.CANCELLED);
    expect(Number(updated.refundedAmount)).toBe(70000);
  });
  it('manual voucher refunds update amounts, voucher status and audit exactly once', async () => {
    const source = await ds.getRepository(Order).findOneByOrFail({ userId: ID.customer, status: OrderStatus.FULFILLED });
    const order = await ds.getRepository(Order).save(ds.getRepository(Order).create({
      ...source, id: crypto.randomUUID(), refundedAmount: 0,
    }));
    await ds.getRepository(Payment).save(ds.getRepository(Payment).create({
      orderId: order.id, gateway: 'SANDBOX', gatewayTxnId: crypto.randomUUID(), amount: Number(order.unitPrice), status: PaymentStatus.SUCCESS,
    }));
    const original = await ds.getRepository(VoucherItem).findOneByOrFail({ id: ID.voucher });
    const voucher = await ds.getRepository(VoucherItem).save(ds.getRepository(VoucherItem).create({
      ...original, id: crypto.randomUUID(), code: crypto.randomUUID(), orderId: order.id, status: VoucherItemStatus.REFUND_PENDING,
    }));
    const refund = await ds.getRepository(RefundRequest).save(ds.getRepository(RefundRequest).create({
      voucherItemId: voucher.id, userId: ID.customer, status: RefundRequestStatus.MANUAL_PENDING, reason: 'test',
    }));
    const url = '/api/refunds/' + refund.id + '/confirm-manual';
    await http.patch(url).set(auth('admin')).send({ gatewayRefundId: 'manual-voucher-test' }).expect(200);
    await http.patch(url).set(auth('admin')).send({ gatewayRefundId: 'manual-voucher-test' }).expect(400);
    expect((await ds.getRepository(VoucherItem).findOneByOrFail({ id: voucher.id })).status).toBe(VoucherItemStatus.REFUNDED);
    const report = await http.get('/api/brands/' + ID.brand + '/report').set(auth('owner')).expect(200);
    expect(report.body.data.grossRevenue).toBe(160000);
    expect(report.body.data.refundedAmount).toBe(80000);
    expect(report.body.data.totalRevenue).toBe(80000);
  });

  it('F03 admin category CRUD rejects non-admins, blank names and deleting referenced categories', async () => {
    await http.post('/api/admin/categories').set(auth('staff')).send({ name: 'Denied' }).expect(403);
    await http.post('/api/admin/categories').set(auth('admin')).send({ name: '   ' }).expect(400);
    const created = await http.post('/api/admin/categories').set(auth('admin')).send({ name: 'Test category', displayOrder: 99 }).expect(201);
    // main wraps successful responses in { data }; keep this test valid before and after that middleware is merged.
    const createdCategory = created.body.data ?? created.body;
    await http.patch('/api/admin/categories/' + createdCategory.id).set(auth('admin')).send({ name: 'Updated category' }).expect(200);
    const campaign = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: ID.campPublished });
    const previous = campaign.categoryId;
    await ds.getRepository(VoucherCampaign).update(campaign.id, { categoryId: createdCategory.id });
    await http.delete('/api/admin/categories/' + createdCategory.id).set(auth('admin')).expect(400);
    await ds.getRepository(VoucherCampaign).update(campaign.id, { categoryId: previous });
    await http.delete('/api/admin/categories/' + createdCategory.id).set(auth('admin')).expect(200);
    await http.delete('/api/admin/categories/' + createdCategory.id).set(auth('admin')).expect(404);
  });

  it('FR-AUTH-09 reset link is one-use, rejects wrong tokens and revokes all old sessions', async () => {
    const bcrypt = await import('bcrypt');
    const template = await ds.getRepository(User).findOneByOrFail({ email: 'owner@highlands.local' });
    const user = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'reset-test@example.test', role: template.role, status: UserStatus.ACTIVE, passwordHash: await bcrypt.hash(PASSWORD, 4) }));
    const initial = await http.post('/api/auth/login').send({ email: user.email, password: PASSWORD, deviceId: 'stable-device-test' }).expect(201);
    const initialTokens = initial.body.data ?? initial.body;
    await http.post('/api/auth/password-reset/request').send({ email: user.email }).expect(201);
    const url = new URL(emails[emails.length - 1].text.match(/https?:\/\/\S+/)![0]);
    const params = new URLSearchParams(url.hash.split('?')[1]);
    const body = { email: user.email, token: params.get('token'), password: 'Replacement@123' };
    await http.post('/api/auth/password-reset/confirm').send({ ...body, token: '0'.repeat(64) }).expect(400);
    await http.post('/api/auth/password-reset/confirm').send(body).expect(201);
    await http.post('/api/auth/password-reset/confirm').send(body).expect(400);
    await http.post('/api/auth/refresh').send({ refreshToken: initialTokens.refreshToken }).expect(401);
    await http.get('/api/brands/me').set({ Authorization: 'Bearer ' + initialTokens.accessToken }).expect(401);
    await http.post('/api/auth/login').send({ email: user.email, password: body.password }).expect(201);
  });

  it('FR-AUTH-09 unknown account reset response does not reveal existence or send email', async () => {
    const before = emails.length;
    await http.post('/api/auth/password-reset/request').send({ email: 'unknown-reset@example.test' }).expect(201);
    expect(emails.length).toBe(before);
  });

  it('FR-AUTH-09 reset links expire after 24 hours', async () => {
    await http.post('/api/auth/password-reset/request').send({ email: 'reset-test@example.test' }).expect(201);
    const url = new URL(emails[emails.length - 1].text.match(/https?:\/\/\S+/)![0]);
    const token = new URLSearchParams(url.hash.split('?')[1]).get('token');
    await ds.getRepository(OtpCode).update({ email: 'reset-test@example.test' }, { expiresAt: new Date(Date.now() - 1000) });
    await http.post('/api/auth/password-reset/confirm').send({ email: 'reset-test@example.test', token, password: PASSWORD }).expect(400);
  });

});
