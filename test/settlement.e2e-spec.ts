// F13 / BR-14: phieu doi soat chi gom voucher da het quyen hoan TAI THOI DIEM CHOT (e2e tren pg-mem)
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CampaignStore, User, VoucherCampaign, VoucherItem } from '../src/entities';
import { CampaignStatus, VoucherItemStatus, VoucherType } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('F13 - chot doi soat giua ky (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let admin: string;
  let customer: string;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret';
    t = await createTestApp();
    ds = t.dataSource;
    admin = await t.login('admin@voucher.local');
    const user = await ds.getRepository(User).save({ email: 'settle@test.local', role: Role.CUSTOMER });
    customer = await t.customerToken(user.id, user.email);
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('voucher con trong han hoan khong vao phieu; voucher da dung thi vao (BR-14)', async () => {
    const now = Date.now();
    const c = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title: 'Doi soat giua ky',
      voucherType: VoucherType.PREPAID,
      salePrice: 40000,
      faceValue: 50000,
      totalQuantity: 10,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: 5,
      saleStartAt: new Date(now - DAY),
      saleEndAt: new Date(now + 30 * DAY),
      voucherExpireAt: new Date(now + 90 * DAY),
      status: CampaignStatus.PUBLISHED,
    });
    await ds.getRepository(CampaignStore).save({ campaignId: c.id, storeId: ID.store1 });

    const res = await t.http
      .post('/api/orders')
      .set({ Authorization: `Bearer ${customer}` })
      .send({ campaignId: c.id, quantity: 2 })
      .expect(201);
    const order = res.body.data.order;
    const p = { orderId: order.id, gatewayTxnId: `T-${crypto.randomUUID()}`, amount: Number(order.totalAmount), status: 'SUCCESS' };
    await t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) }).expect(200);

    const [used, stillRefundable] = await ds.getRepository(VoucherItem).find({ where: { campaignId: c.id } });
    await ds.getRepository(VoucherItem).update(used.id, { status: VoucherItemStatus.USED, usedAt: new Date() });
    expect(new Date(stillRefundable.refundableUntil).getTime()).toBeGreaterThan(now);

    // Chot ky dang dien ra (cuoi ky o tuong lai) giong nut "chot" cua quan tri
    const run = await t.http
      .post('/api/admin/settlements/run')
      .set({ Authorization: `Bearer ${admin}` })
      .send({ periodStart: new Date(now - 10 * DAY).toISOString(), periodEnd: new Date(now + 10 * DAY).toISOString() })
      .expect(201);
    const mine = run.body.data.find((s: { brandId: string }) => s.brandId === ID.brand);
    const detail = await t.http.get(`/api/settlements/${mine.id}`).set({ Authorization: `Bearer ${admin}` }).expect(200);
    const ids = detail.body.data.items.map((i: { voucherItemId: string }) => i.voucherItemId);

    expect(ids).toContain(used.id);
    expect(ids).not.toContain(stillRefundable.id);
  });
});
