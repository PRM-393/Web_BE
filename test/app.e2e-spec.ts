// Kiem thu e2e: chay toan bo AppModule tren PostgreSQL gia lap (pg-mem), nap database/postgres/schema.sql + seed.sql
// roi goi API qua HTTP nhu client that. Bat duoc ca loi dang ky module / entity ma tsc khong thay.
//   npm run test:e2e
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { corsOrigin } from '../src/config/cors';
import * as entities from '../src/entities';
import { MailService } from '../src/modules/auth/mail.service';
import { Order } from '../src/entities/order.entity';
import { Payment } from '../src/entities/payment.entity';
import { RefreshToken } from '../src/entities/refresh-token.entity';
import { OtpCode } from '../src/entities/otp-code.entity';
import { VoucherItem } from '../src/entities/voucher-item.entity';
import { RefundRequest } from '../src/entities/refund-request.entity';
import { UserStatus, CampaignStatus, OrderStatus, PaymentStatus, VoucherItemStatus, RefundRequestStatus } from '../src/common/enums/status.enum';
import { User } from '../src/entities/user.entity';
import { VoucherCampaign } from '../src/entities/voucher-campaign.entity';
import { RedeemService } from '../src/modules/redeem/redeem.service';

const PASSWORD = 'Voucher@123';
// id co dinh trong database/generate-seed.ts
const ID = {
  brand: '33333333-0000-4000-8000-000000000001',
  store1: '44444444-0000-4000-8000-000000000001',
  customer: '22222222-0000-4000-8000-000000000004',
  voucher: '99999999-0000-4000-8000-000000000001',
  campPublished: '66666666-0000-4000-8000-000000000001',
};

function sqlStatements(file: string) {
  return fs
    .readFileSync(path.join(__dirname, '..', 'database', 'postgres', file), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('--') && !/^CREATE EXTENSION/i.test(l))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ''))
    .filter(Boolean);
}

async function createDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: () => crypto.randomUUID(), impure: true });
  db.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 16' });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'voucher_platform' });
  // Nap dung file SQL giao cho nhom: neu entity va schema.sql lech nhau, cac truy van ben duoi se loi
  for (const stmt of [...sqlStatements('schema.sql'), ...sqlStatements('seed.sql')]) db.public.none(stmt);

  const ds: DataSource = await db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: Object.values(entities).filter((e) => typeof e === 'function'),
  });
  return ds.initialize();
}

describe('Web_BE e2e (pg-mem)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const token: Record<string, string> = {};
  const emails: {to: string; subject: string; text: string}[] = [];
  let ds: DataSource;

  const login = async (email: string) => {
    const res = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    return res.body.accessToken as string;
  };
  const auth = (role: string) => ({ Authorization: `Bearer ${token[role]}` });

  beforeAll(async () => {
    const dataSource = await createDataSource();
    ds = dataSource;
    await ds.getRepository(VoucherCampaign).update(ID.campPublished, { saleStartAt: new Date(Date.now() - 86400000), saleEndAt: new Date(Date.now() + 30 * 86400000), voucherExpireAt: new Date(Date.now() + 60 * 86400000) });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (to: string, subject: string, text: string) => { emails.push({to, subject, text}); } })
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    token.owner = await login('owner@highlands.local');
    token.staff = await login('staff@highlands.local');
    token.admin = await login('admin@voucher.local');
    await http.post('/api/auth/otp/request').send({ email: 'khach@voucher.local' }).expect(201);
    const otp = emails[emails.length - 1].text.match(/\b\d{6}\b/)![0];
    const customer = await http.post('/api/auth/otp/verify').send({ email: 'khach@voucher.local', otp }).expect(201);
    token.customer = customer.body.accessToken;
    await http.post('/api/auth/select-store').set(auth('staff')).send({ storeId: ID.store1 }).expect(201);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  it('health check cho Render: API va CSDL deu song', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
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

  it('dang nhap sai mat khau tra 401', async () => {
    await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: 'sai-mat-khau' }).expect(401);
  });

  it('chan sai vai tro: nhan vien goi API quan tri bi 403 (NFR-SEC-03)', async () => {
    await http.get('/api/admin/dashboard').set(auth('staff')).expect(403);
  });

  it('chu thuong hieu xem ho so, chi nhanh, nhan vien', async () => {
    const me = await http.get('/api/brands/me').set(auth('owner')).expect(200);
    expect(me.body[0].name).toBe('Highlands Coffee');
    const stores = await http.get(`/api/brands/${ID.brand}/stores`).set(auth('owner')).expect(200);
    expect(stores.body).toHaveLength(2);
    const staff = await http.get(`/api/brands/${ID.brand}/staff`).set(auth('owner')).expect(200);
    expect(staff.body).toHaveLength(2);
    expect(staff.body[0].email).toBe('staff@highlands.local');
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
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.discountType).toBe('PERCENT');

    await http.patch(`/api/campaigns/${created.body.id}/submit`).set(auth('owner')).expect(200);
    const pending = await http.get('/api/admin/pending/campaigns').set(auth('admin')).expect(200);
    expect(pending.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const approved = await http.patch(`/api/campaigns/${created.body.id}/approve`).set(auth('admin')).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.approvedBy).toBeTruthy();
    expect(approved.body.submittedAt).toBeTruthy();
  });

  it('tim kiem chien dich dang ban theo tu khoa (khong phan biet hoa thuong)', async () => {
    const res = await http.get('/api/vouchers').query({ keyword: 'VOUCHER' }).expect(200);
    const items = Array.isArray(res.body) ? res.body : res.body.data ?? res.body.items;
    expect(items.map((c: { id: string }) => c.id)).toContain(ID.campPublished);
  });

  it('vi cua khach khong lo secretKey (NFR-SEC-05)', async () => {
    const res = await http.get('/api/wallet').set(auth('customer')).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].secretKey).toBeUndefined();
    expect(res.body[0].refundableUntil).toBeTruthy();
  });

  it('xac nhan su dung bang OTP: token cu bi vo hieu, dung mot lan (BR-06, BR-07)', async () => {
    const redeem = app.get(RedeemService);
    const first = await redeem.requestToken(ID.customer, { voucherItemId: ID.voucher });
    const second = await redeem.requestToken(ID.customer, { voucherItemId: ID.voucher });

    const stores = await http.get('/api/redeem/my-stores').set(auth('staff')).expect(200);
    expect(stores.body).toHaveLength(2);

    const old = await http.post('/api/redeem').set(auth('staff')).send({ storeId: ID.store1, otpCode: first.otpCode });
    if (first.otpCode !== second.otpCode) expect(old.status).toBe(400);

    const ok = await http
      .post('/api/redeem')
      .set(auth('staff'))
      .send({ storeId: ID.store1, otpCode: second.otpCode, billAmount: 95000 })
      .expect(201);
    expect(ok.body.voucherItemId).toBe(ID.voucher);

    await http.post('/api/redeem').set(auth('staff')).send({ storeId: ID.store1, otpCode: second.otpCode }).expect(400);
    const history = await http.get('/api/redeem/history/today').set(auth('staff')).expect(200);
    expect(history.body).toHaveLength(1);
  });

  it('chot doi soat theo tung voucher, dung ty le da chot vao don (BR-09, BR-14)', async () => {
    const run = await http
      .post('/api/admin/settlements/run')
      .set(auth('admin'))
      .send({ periodStart: '2026-09-30T17:00:00.000Z', periodEnd: '2026-10-31T16:59:59.000Z' })
      .expect(201);
    expect(run.body).toHaveLength(1);
    expect(run.body[0].voucherCount).toBe(1);
    expect(Number(run.body[0].commissionAmount)).toBe(8000);
    expect(Number(run.body[0].payableAmount)).toBe(72000);

    // chay lai khong sinh trung (DC-06)
    const again = await http
      .post('/api/admin/settlements/run')
      .set(auth('admin'))
      .send({ periodStart: '2026-09-30T17:00:00.000Z', periodEnd: '2026-10-31T16:59:59.000Z' })
      .expect(201);
    expect(again.body).toHaveLength(0);

    const list = await http.get('/api/admin/settlements').set(auth('admin')).expect(200);
    expect(list.body[0].brandName).toBe('Highlands Coffee');
  });

  it('danh gia: mot lan moi chien dich, thuong hieu phan hoi (DC-09, FR-ENGAGE-04)', async () => {
    const created = await http
      .post('/api/reviews')
      .set(auth('customer'))
      .send({ voucherItemId: ID.voucher, rating: 5, comment: 'Ngon' })
      .expect(201);
    expect(created.body.campaignId).toBe(ID.campPublished);
    await http.post('/api/reviews').set(auth('customer')).send({ voucherItemId: ID.voucher, rating: 4 }).expect(400);

    const list = await http.get(`/api/brands/${ID.brand}/reviews`).set(auth('owner')).expect(200);
    expect(list.body).toHaveLength(1);
    const replied = await http
      .patch(`/api/reviews/${created.body.id}/reply`)
      .set(auth('owner'))
      .send({ reply: 'Cam on ban!' })
      .expect(200);
    expect(replied.body.brandRepliedAt).toBeTruthy();
  });

  it('bang dieu khien quan tri', async () => {
    const res = await http.get('/api/admin/dashboard').set(auth('admin')).expect(200);
    expect(res.body.totalActiveBrands).toBe(5); // seed co 5 thuong hieu APPROVED (Circle K con PENDING)
  });
  it('refresh rotates once, logout revokes both access and refresh', async () => {
    const session = (await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: PASSWORD, deviceId: 'test-device' }).expect(201)).body;
    const next = (await http.post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(201)).body;
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
    const session = (await http.post('/api/auth/login').send({ email: 'owner@highlands.local', password: PASSWORD }).expect(201)).body;
    const owner = await ds.getRepository(User).findOneByOrFail({ email: 'owner@highlands.local' });
    await ds.getRepository(User).update(owner.id, { status: UserStatus.INACTIVE });
    try {
      await http.get('/api/brands/me').set({ Authorization: 'Bearer ' + session.accessToken }).expect(401);
      await http.post('/api/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      await http.post('/api/auth/login').send({ email: owner.email, password: PASSWORD }).expect(401);
    } finally { await ds.getRepository(User).update(owner.id, { status: UserStatus.ACTIVE }); }
    await ds.getRepository(User).update(ID.customer, { status: UserStatus.INACTIVE });
    try { await http.post('/api/auth/otp/request').send({ email: 'khach@voucher.local' }).expect(400); }
    finally { await ds.getRepository(User).update(ID.customer, { status: UserStatus.ACTIVE }); }
  });

  it('OTP is hashed, one-use, limited after successful login, and limit expires after one hour', async () => {
    const email = 'limits@example.com';
    await http.post('/api/auth/otp/request').send({ email }).expect(201);
    const otp = emails[emails.length - 1].text.match(/\b\d{6}\b/)![0];
    const record = await ds.getRepository(OtpCode).findOneByOrFail({ email });
    expect(record.codeHash).not.toBe(otp);
    await http.post('/api/auth/otp/verify').send({ email, otp }).expect(201);
    await http.post('/api/auth/otp/verify').send({ email, otp }).expect(401);
    for (let i = 0; i < 4; i++) await http.post('/api/auth/otp/request').send({ email }).expect(201);
    await http.post('/api/auth/otp/request').send({ email }).expect(429);
    await ds.getRepository(OtpCode).update({ email }, { createdAt: new Date(Date.now() - 3600001) });
    await http.post('/api/auth/otp/request').send({ email }).expect(201);
  });

  it('five wrong OTP attempts invalidate a correct code', async () => {
    const email = 'attempts@example.com';
    await http.post('/api/auth/otp/request').send({ email }).expect(201);
    const otp = emails[emails.length - 1].text.match(/\b\d{6}\b/)![0];
    const wrong = otp === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await http.post('/api/auth/otp/verify').send({ email, otp: wrong }).expect(401);
    await http.post('/api/auth/otp/verify').send({ email, otp }).expect(401);
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
    expect(report.body.totalVoucherUsed).toBe(1);
    expect(report.body.totalRevenue).toBe(80000);
    expect(report.body.usageRate).toBe(100);
  });

  it('search finds brand names, uses campaign categories and includes sold-out', async () => {
    const repo = ds.getRepository(VoucherCampaign);
    const original = await repo.findOneByOrFail({ id: ID.campPublished });
    const categoryId = '11111111-0000-4000-8000-000000000003';
    await repo.update(original.id, { categoryId, status: CampaignStatus.SOLD_OUT });
    try {
      const response = await http.get('/api/vouchers').query({ keyword: 'highlands', categoryId }).expect(200);
      expect(response.body.items.map((c: any) => c.id)).toContain(original.id);
      const item = response.body.items.find((c: any) => c.id === original.id);
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
    const { latitude: lat, longitude: lng } = stores.body[0];
    const nearby = await http.get('/api/vouchers').query({ lat, lng, radiusKm: 1, sort: 'distance_asc' }).expect(200);
    expect(nearby.body.items.map((c: any) => c.id)).toContain(ID.campPublished);
    expect(nearby.body.items.find((c: any) => c.id === ID.campPublished).distanceKm).toBeCloseTo(0);
    const far = await http.get('/api/vouchers').query({ lat: 0, lng: 0, radiusKm: 1 }).expect(200);
    expect(far.body.items).toHaveLength(0);
    const denied = await http.get('/api/vouchers').query({ locationDenied: true, radiusKm: 1 }).expect(200);
    expect(denied.body.locationDenied).toBe(true);
    await http.get('/api/vouchers').query({ lat: 10 }).expect(400);
    await http.get('/api/vouchers').query({ lat: 91, lng: 10 }).expect(400);
    await http.get('/api/vouchers').query({ lat: 10, lng: 10, radiusKm: 2 }).expect(400);
    await http.get('/api/vouchers/66666666-0000-4000-8000-000000000002').expect(404);
    const detail = await http.get('/api/vouchers/' + ID.campPublished).query({ lat, lng }).expect(200);
    expect(detail.body.stores).toHaveLength(2);
    expect(detail.body.refundPolicy.windowDays).toBe(7);
    expect(detail.body.reviewCount).toBe(1);
    expect(detail.body.averageRating).toBe(5);
    expect(detail.body.brand.bankInfo).toBeUndefined();
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
    expect(queue.body.find((o: any) => o.id === order.id).payments[0].amount).toBe(70000);
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
    expect(report.body.grossRevenue).toBe(160000);
    expect(report.body.refundedAmount).toBe(80000);
    expect(report.body.totalRevenue).toBe(80000);
  });

  it('F03 admin category CRUD rejects non-admins, blank names and deleting referenced categories', async () => {
    await http.post('/api/admin/categories').set(auth('staff')).send({ name: 'Denied' }).expect(403);
    await http.post('/api/admin/categories').set(auth('admin')).send({ name: '   ' }).expect(400);
    const created = await http.post('/api/admin/categories').set(auth('admin')).send({ name: 'Test category', displayOrder: 99 }).expect(201);
    await http.patch('/api/admin/categories/' + created.body.id).set(auth('admin')).send({ name: 'Updated category' }).expect(200);
    const campaign = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: ID.campPublished });
    const previous = campaign.categoryId;
    await ds.getRepository(VoucherCampaign).update(campaign.id, { categoryId: created.body.id });
    await http.delete('/api/admin/categories/' + created.body.id).set(auth('admin')).expect(400);
    await ds.getRepository(VoucherCampaign).update(campaign.id, { categoryId: previous });
    await http.delete('/api/admin/categories/' + created.body.id).set(auth('admin')).expect(200);
    await http.delete('/api/admin/categories/' + created.body.id).set(auth('admin')).expect(404);
  });

  it('FR-AUTH-09 reset link is one-use, rejects wrong tokens and revokes all old sessions', async () => {
    const bcrypt = await import('bcrypt');
    const template = await ds.getRepository(User).findOneByOrFail({ email: 'owner@highlands.local' });
    const user = await ds.getRepository(User).save(ds.getRepository(User).create({ email: 'reset-test@example.test', role: template.role, status: UserStatus.ACTIVE, passwordHash: await bcrypt.hash(PASSWORD, 4) }));
    const initial = await http.post('/api/auth/login').send({ email: user.email, password: PASSWORD, deviceId: 'stable-device-test' }).expect(201);
    await http.post('/api/auth/password-reset/request').send({ email: user.email }).expect(201);
    const url = new URL(emails[emails.length - 1].text.match(/https?:\/\/\S+/)![0]);
    const params = new URLSearchParams(url.hash.split('?')[1]);
    const body = { email: user.email, token: params.get('token'), password: 'Replacement@123' };
    await http.post('/api/auth/password-reset/confirm').send({ ...body, token: '0'.repeat(64) }).expect(400);
    await http.post('/api/auth/password-reset/confirm').send(body).expect(201);
    await http.post('/api/auth/password-reset/confirm').send(body).expect(400);
    await http.post('/api/auth/refresh').send({ refreshToken: initial.body.refreshToken }).expect(401);
    await http.get('/api/brands/me').set({ Authorization: 'Bearer ' + initial.body.accessToken }).expect(401);
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
