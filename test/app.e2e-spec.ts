// Kiem thu e2e: chay toan bo AppModule tren PostgreSQL gia lap (pg-mem), nap database/postgres/schema.sql + seed.sql
// roi goi API qua HTTP nhu client that. Bat duoc ca loi dang ky module / entity ma tsc khong thay.
//   npm run test:e2e
import { INestApplication } from '@nestjs/common';
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
import { configureApp } from '../src/app.setup';
import { corsOrigin } from '../src/config/cors';
import * as entities from '../src/entities';
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

  const login = async (email: string) => {
    const res = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    return res.body.data.accessToken as string;
  };
  const auth = (role: string) => ({ Authorization: `Bearer ${token[role]}` });

  beforeAll(async () => {
    const dataSource = await createDataSource();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());

    token.owner = await login('owner@highlands.local');
    token.staff = await login('staff@highlands.local');
    token.admin = await login('admin@voucher.local');
    // Khach dang nhap bang OTP qua email; trong test ky thang access token cung dinh dang voi AuthService
    token.customer = app.get(JwtService).sign(
      { sub: ID.customer, email: 'khach@voucher.local', role: 'CUSTOMER' },
      { secret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret', expiresIn: '15m' },
    );
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
});
