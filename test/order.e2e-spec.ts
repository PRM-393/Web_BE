// F09 / F18: kiem thu e2e luong mua va thanh toan tren PostgreSQL gia lap (pg-mem)
//   npm run test:e2e
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { Order, PaymentRefund, User, VoucherCampaign, VoucherItem, CampaignStore } from '../src/entities';
import { CampaignStatus, OrderStatus, VoucherType } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { OrderService } from '../src/modules/order/order.service';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('F09 - mua va thanh toan (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  // Tao khach hang moi va chien dich dang ban voi ton kho nho de kiem tra bien
  async function newCustomer(name: string) {
    const user = await ds.getRepository(User).save({ email: `${name}@test.local`, role: Role.CUSTOMER, fullName: name });
    tokens[name] = await t.customerToken(user.id, user.email);
    return user;
  }

  async function newCampaign(total: number, limitPerUser: number, salePrice = 50000) {
    const now = Date.now();
    const c = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title: `Test ${crypto.randomUUID().slice(0, 6)}`,
      voucherType: VoucherType.PREPAID,
      salePrice,
      faceValue: salePrice * 2,
      totalQuantity: total,
      // pg-mem luu DEFAULT '0' dang chuoi -> dat ro gia tri so (PostgreSQL that tu ep kieu)
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser,
      saleStartAt: new Date(now - DAY),
      saleEndAt: new Date(now + 30 * DAY),
      voucherExpireAt: new Date(now + 90 * DAY),
      status: CampaignStatus.PUBLISHED,
    });
    await ds.getRepository(CampaignStore).save({ campaignId: c.id, storeId: ID.store1 });
    return c;
  }

  const campaign = (id: string) => ds.getRepository(VoucherCampaign).findOneByOrFail({ id });
  const order = (id: string) => ds.getRepository(Order).findOneByOrFail({ id });

  async function placeOrder(who: string, campaignId: string, quantity: number, expect = 201) {
    const res = await t.http.post('/api/orders').set(auth(who)).send({ campaignId, quantity }).expect(expect);
    return res.body;
  }

  function webhook(o: { id: string; totalAmount: number | string }, opts: { txn?: string; amount?: number; status?: string } = {}) {
    const p = {
      orderId: o.id,
      gatewayTxnId: opts.txn ?? `T-${crypto.randomUUID()}`,
      amount: opts.amount ?? Number(o.totalAmount),
      status: opts.status ?? 'SUCCESS',
    };
    return t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) });
  }

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret';
    t = await createTestApp();
    ds = t.dataSource;
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('tao don: giu cho, het han sau 15 phut, chua cau hinh payOS thi chua co link (dung gia lap)', async () => {
    await newCustomer('an');
    const c = await newCampaign(5, 2);
    const body = await placeOrder('an', c.id, 2);
    expect(body.data.order.status).toBe(OrderStatus.PENDING);
    expect(body.data.paymentUrl).toBeNull();
    expect(body.data.order.paymentOrderCode).toMatch(/^\d+$/);
    const minutes = (new Date(body.data.order.reservedUntil).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expect((await campaign(c.id)).reservedQuantity).toBe(2);
  });

  it('BR-01: gioi han mua tinh ca don PENDING; khong ban mot phan', async () => {
    await newCustomer('binh');
    const c = await newCampaign(10, 2);
    const over = await placeOrder('binh', c.id, 3, 400);
    expect(over.error.message).toContain('tối đa 2');

    await placeOrder('binh', c.id, 2);
    const again = await placeOrder('binh', c.id, 1, 400);
    expect(again.error.message).toContain('giới hạn 2');
  });

  it('thanh toan thanh cong: PAID -> FULFILLED, chot hoa hong, sinh voucher co refundableUntil; webhook trung chi xu ly 1 lan', async () => {
    await newCustomer('chi');
    const c = await newCampaign(5, 3);
    const { data } = await placeOrder('chi', c.id, 2);

    const first = await webhook(data.order, { txn: 'TXN-CHI-1' }).expect(200);
    expect(first.body.outcome).toBe('FULFILLED');
    const dup = await webhook(data.order, { txn: 'TXN-CHI-1' }).expect(200);
    expect(dup.body.outcome).toBe('DUPLICATE');

    const o = await order(data.order.id);
    expect(o.status).toBe(OrderStatus.FULFILLED);
    expect(Number(o.commissionRate)).toBeGreaterThan(0);
    const vouchers = await ds.getRepository(VoucherItem).findBy({ orderId: o.id });
    expect(vouchers).toHaveLength(2);
    expect(new Set(vouchers.map((v) => v.code)).size).toBe(2);
    expect(vouchers[0].refundableUntil.getTime()).toBeLessThanOrEqual(o.paidAt.getTime() + 7 * DAY);

    const after = await campaign(c.id);
    expect([after.soldQuantity, after.reservedQuantity]).toEqual([2, 0]);

    const wallet = await t.http.get('/api/wallet').set(auth('chi')).expect(200);
    expect(wallet.body.data).toHaveLength(2);
  });

  it('chu ky webhook sai bi tu choi (BR-18)', async () => {
    const p = { orderId: crypto.randomUUID(), gatewayTxnId: 'X', amount: 1, status: 'SUCCESS', signature: 'gia-mao' };
    await t.http.post('/api/orders/payment-webhook').send(p).expect(401);
  });

  it('het ton kho kha dung -> SOLD_OUT; lech so tien -> PAYMENT_MISMATCH va nha giu cho (BR-20)', async () => {
    await newCustomer('dung');
    const c = await newCampaign(1, 2);
    const { data } = await placeOrder('dung', c.id, 1);
    expect((await campaign(c.id)).status).toBe(CampaignStatus.SOLD_OUT);
    await placeOrder('dung', c.id, 1, 400);

    const res = await webhook(data.order, { amount: 1000 }).expect(200);
    expect(res.body.outcome).toBe('PAYMENT_MISMATCH');
    expect((await order(data.order.id)).status).toBe(OrderStatus.PAYMENT_MISMATCH);
    const after = await campaign(c.id);
    expect(after.reservedQuantity).toBe(0);
    expect(after.status).toBe(CampaignStatus.PUBLISHED);
  });

  it('thanh toan that bai -> CANCELLED va tra ton kho', async () => {
    await newCustomer('em');
    const c = await newCampaign(3, 3);
    const { data } = await placeOrder('em', c.id, 3);
    const res = await webhook(data.order, { status: 'FAILED' }).expect(200);
    expect(res.body.outcome).toBe('CANCELLED');
    const o = await order(data.order.id);
    expect(o.status).toBe(OrderStatus.CANCELLED);
    expect(o.cancelledAt).toBeTruthy();
    expect((await campaign(c.id)).reservedQuantity).toBe(0);
  });

  it('job huy don qua han; webhook den muon: con hang thi phat hanh, het hang thi hoan 100% (BR-11)', async () => {
    await newCustomer('giang');
    await newCustomer('hoa');
    const c = await newCampaign(1, 1);
    const service = t.app.get(OrderService);

    // Don cua Giang het 15 phut -> job huy, nha ton kho
    const late = (await placeOrder('giang', c.id, 1)).data.order;
    expect(await service.cancelExpiredOrders(new Date(Date.now() + 16 * 60 * 1000))).toBeGreaterThanOrEqual(1);
    expect((await order(late.id)).status).toBe(OrderStatus.CANCELLED);

    // Con hang -> webhook den muon van phat hanh
    const ok = await webhook(late).expect(200);
    expect(ok.body.outcome).toBe('FULFILLED_LATE');
    expect((await order(late.id)).status).toBe(OrderStatus.FULFILLED);

    // Chien dich moi: Hoa dat, bi huy vi qua han, nguoi khac mua mat suat cuoi -> Hoa thanh toan muon bi hoan 100%
    const c2 = await newCampaign(1, 1);
    const hoa = (await placeOrder('hoa', c2.id, 1)).data.order;
    await service.cancelExpiredOrders(new Date(Date.now() + 16 * 60 * 1000));
    const other = (await placeOrder('giang', c2.id, 1)).data.order;
    expect((await webhook(other).expect(200)).body.outcome).toBe('FULFILLED');

    const refunded = await webhook(hoa).expect(200);
    expect(refunded.body.outcome).toBe('REFUNDED_OVERSOLD');
    expect((await order(hoa.id)).status).toBe(OrderStatus.REFUNDED_OVERSOLD);
    const refunds = await ds.getRepository(PaymentRefund).find();
    expect(refunds.some((r) => Number(r.amount) === Number(hoa.totalAmount) && r.reasonType === 'OVERSOLD')).toBe(true);
    expect((await campaign(c2.id)).soldQuantity).toBe(1);
  });

  it('2 nguoi mua voucher cuoi cung cung luc: chi 1 don thanh cong, khong ban vuot (DC-03)', async () => {
    await newCustomer('khoa');
    await newCustomer('lan');
    const c = await newCampaign(1, 1);
    const results = await Promise.all([
      t.http.post('/api/orders').set(auth('khoa')).send({ campaignId: c.id, quantity: 1 }),
      t.http.post('/api/orders').set(auth('lan')).send({ campaignId: c.id, quantity: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const after = await campaign(c.id);
    expect(after.reservedQuantity + after.soldQuantity).toBeLessThanOrEqual(after.totalQuantity);
  });

  it('xem trang thai don va thanh toan lai: chi chu don duoc xem (FR-ORDER-05, FR-ORDER-12)', async () => {
    await newCustomer('minh');
    await newCustomer('nam');
    const c = await newCampaign(5, 2);
    const o = (await placeOrder('minh', c.id, 1)).data.order;

    const mine = await t.http.get(`/api/orders/${o.id}`).set(auth('minh')).expect(200);
    expect(mine.body.data.status).toBe(OrderStatus.PENDING);
    await t.http.get(`/api/orders/${o.id}`).set(auth('nam')).expect(403);

    const retry = await t.http.post(`/api/orders/${o.id}/pay`).set(auth('minh')).expect(201);
    expect(retry.body.data.order.id).toBe(o.id);
  });

  it('gia lap thanh toan chi chay khi PAYMENT_SIMULATOR=true', async () => {
    await newCustomer('oanh');
    const c = await newCampaign(5, 2);
    const o = (await placeOrder('oanh', c.id, 1)).data.order;

    process.env.PAYMENT_SIMULATOR = 'false';
    await t.http.post(`/api/orders/${o.id}/simulate-payment`).set(auth('oanh')).send({}).expect(403);
    // khong co khoa payOS va tat gia lap: khong tao don giu cho ma khach khong the thanh toan
    const blocked = await t.http.post('/api/orders').set(auth('oanh')).send({ campaignId: c.id, quantity: 1 }).expect(503);
    expect(blocked.body.error.message).toContain('payOS');

    process.env.PAYMENT_SIMULATOR = 'true';
    const res = await t.http.post(`/api/orders/${o.id}/simulate-payment`).set(auth('oanh')).send({}).expect(201);
    expect(res.body.data.outcome).toBe('FULFILLED');
    expect(res.body.data.order.status).toBe(OrderStatus.FULFILLED);
  });

  it('payOS: tao link that, app hoi trang thai thi may chu hoi lai payOS va phat hanh voucher (khong can webhook)', async () => {
    await newCustomer('phuong');
    const c = await newCampaign(5, 2);
    const keys = ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'] as const;
    for (const k of keys) process.env[k] = 'test-' + k;
    const realFetch = global.fetch;
    let payosStatus = 'PENDING';
    const calls: string[] = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ code: '00', data: { checkoutUrl: 'https://pay.payos.vn/web/test' } }));
      }
      const total = (await t.dataSource.getRepository(Order).findOneByOrFail({ userId: (await t.dataSource.getRepository(User).findOneByOrFail({ email: 'phuong@test.local' })).id })).totalAmount;
      return new Response(JSON.stringify({ code: '00', data: { status: payosStatus, amountPaid: payosStatus === 'PAID' ? Number(total) : 0, transactions: payosStatus === 'PAID' ? [{ reference: 'FT123' }] : [] } }));
    }) as typeof fetch;
    try {
      const created = (await placeOrder('phuong', c.id, 1)).data;
      expect(created.paymentUrl).toBe('https://pay.payos.vn/web/test');
      const id = created.order.id;
      expect((await t.http.get(`/api/orders/${id}`).set(auth('phuong')).expect(200)).body.data.status).toBe(OrderStatus.PENDING);
      payosStatus = 'PAID';
      // hoi lai trong 4 giay dau: chua goi payOS lan nua
      expect((await t.http.get(`/api/orders/${id}`).set(auth('phuong')).expect(200)).body.data.status).toBe(OrderStatus.PENDING);
      (t.app.get(OrderService) as any).lastPayosSync.clear();
      const paid = await t.http.get(`/api/orders/${id}`).set(auth('phuong')).expect(200);
      expect(paid.body.data.status).toBe(OrderStatus.FULFILLED);
      expect(await t.dataSource.getRepository(VoucherItem).count({ where: { orderId: id } })).toBe(1);
      expect(calls.filter((x) => x.startsWith('GET')).length).toBe(2);
    } finally {
      global.fetch = realFetch;
      for (const k of keys) delete process.env[k];
    }
  });

  it('webhook payOS: chu ky sai bi bo qua, orderCode la (payOS gui thu) tra 200', async () => {
    const bad = await t.http.post('/api/orders/payos-webhook').send({ code: '00', data: { orderCode: 123 }, signature: 'x' }).expect(200);
    expect(bad.body.success).toBe(false);
  });

  it('khach seed van mua duoc chien dich dang ban', async () => {
    tokens.seed = await t.customerToken(ID.customer, 'khach@voucher.local');
    const body = await placeOrder('seed', ID.campPublished, 1);
    expect(body.data.order.status).toBe(OrderStatus.PENDING);
  });
});
