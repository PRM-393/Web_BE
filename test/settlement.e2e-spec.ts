// F13 / BR-14: phieu doi soat chi gom voucher da het quyen hoan TAI THOI DIEM CHOT (e2e tren pg-mem)
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  CampaignStore,
  RefundRequest,
  SettlementItem,
  User,
  VoucherCampaign,
  VoucherItem,
} from '../src/entities';
import {
  CampaignStatus,
  RefundRequestStatus,
  VoucherItemStatus,
  VoucherType,
} from '../src/common/enums/status.enum';
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

  // DC-06: mot voucher chi nam trong toi da mot SettlementItem. Day la moc "Xong khi" cua T12 va
  // truoc do khong co ca test nao khoa lai, du ma chong trung (LEFT JOIN ... IS NULL) da co san.
  it('chay lai cung mot ky khong sinh phieu trung, khong nhan doi so lieu (DC-06)', async () => {
    const now = Date.now();
    const { campaign } = await banVoucher('Chay hai lan', 2);
    const items = await ds.getRepository(VoucherItem).find({ where: { campaignId: campaign.id } });
    await ds.getRepository(VoucherItem).update(
      items.map((i) => i.id),
      { status: VoucherItemStatus.USED, usedAt: new Date() },
    );

    const ky = {
      periodStart: new Date(now - 10 * DAY).toISOString(),
      periodEnd: new Date(now + 10 * DAY).toISOString(),
    };
    const lan1 = await chotKy(ky);
    const lan2 = await chotKy(ky);

    // Luot dau chot het voucher du dieu kien; luot sau khong con gi de chot nen khong sinh phieu nao
    expect(lan1.find((s: { brandId: string }) => s.brandId === ID.brand)).toBeDefined();
    expect(lan2.find((s: { brandId: string }) => s.brandId === ID.brand)).toBeUndefined();

    // Va quan trong nhat: khong voucher nao bi tinh tien hai lan.
    // Dem o phia JS vi pg-mem chua ho tro HAVING.
    const all = await ds.getRepository(SettlementItem).find();
    const trung = all
      .map((i) => i.voucherItemId)
      .filter((id, i, arr) => arr.indexOf(id) !== i);
    expect(trung).toEqual([]);
  });

  // BR-14 / DC-13: con yeu cau hoan dang xu ly thi chua chot, ke ca khi da qua refundableUntil.
  // Bo loc cu chi xet refundableUntil nen mot yeu cau MANUAL_PENDING keo dai van lot vao phieu.
  it.each([
    RefundRequestStatus.REQUESTED,
    RefundRequestStatus.PROCESSING,
    RefundRequestStatus.MANUAL_PENDING,
  ])('voucher dang co yeu cau hoan %s bi loai khoi ky (BR-14)', async (status) => {
    const now = Date.now();
    const { campaign, userId } = await banVoucher(`Dang hoan ${status}`, 2);
    const [dangHoan, binhThuong] = await ds.getRepository(VoucherItem).find({ where: { campaignId: campaign.id } });

    // Ca hai deu da dung => het quyen hoan theo bo loc cu, chi khac nhau o yeu cau hoan dang treo
    await ds.getRepository(VoucherItem).update([dangHoan.id, binhThuong.id], {
      status: VoucherItemStatus.USED,
      usedAt: new Date(),
    });
    await ds.getRepository(RefundRequest).save({ voucherItemId: dangHoan.id, userId, reason: 'Doi y', status });

    const created = await chotKy({
      periodStart: new Date(now - 10 * DAY).toISOString(),
      periodEnd: new Date(now + 10 * DAY).toISOString(),
    });
    const phieu = created.find((s: { brandId: string }) => s.brandId === ID.brand)!;
    const detail = await t.http.get(`/api/settlements/${phieu.id}`).set({ Authorization: `Bearer ${admin}` }).expect(200);
    const ids = detail.body.data.items.map((i: { voucherItemId: string }) => i.voucherItemId);

    expect(ids).toContain(binhThuong.id);
    expect(ids).not.toContain(dangHoan.id);
  });

  // FR-SETTLE-07: danh dau chi tra bat buoc ngay + ma giao dich, va phai ghi AuditLog (NFR-SEC-07)
  it('danh dau chi tra: thieu ma giao dich hoac ngay thi bi tu choi, du thi ghi AuditLog', async () => {
    const now = Date.now();
    const { campaign } = await banVoucher('Chi tra', 1);
    const [item] = await ds.getRepository(VoucherItem).find({ where: { campaignId: campaign.id } });
    await ds.getRepository(VoucherItem).update(item.id, { status: VoucherItemStatus.USED, usedAt: new Date() });
    const created = await chotKy({
      periodStart: new Date(now - 10 * DAY).toISOString(),
      periodEnd: new Date(now + 10 * DAY).toISOString(),
    });
    const phieu = created.find((s: { brandId: string }) => s.brandId === ID.brand)!;
    const markPaid = (body: Record<string, unknown>) =>
      t.http.patch(`/api/admin/settlements/${phieu.id}/mark-paid`).set({ Authorization: `Bearer ${admin}` }).send(body);

    await markPaid({ paidAt: new Date().toISOString() }).expect(400); // thieu ma giao dich
    await markPaid({ bankTxnRef: '   ' }).expect(400); // ma rong + thieu ngay
    await markPaid({ bankTxnRef: 'FT123', paidAt: new Date(now + 5 * DAY).toISOString() }).expect(400); // ngay tuong lai

    const ngayChuyen = new Date(now - DAY).toISOString();
    const ok = await markPaid({ bankTxnRef: 'FT26102900123', paidAt: ngayChuyen }).expect(200);
    expect(ok.body.data.status).toBe('PAID');
    expect(ok.body.data.bankTxnRef).toBe('FT26102900123');
    expect(new Date(ok.body.data.paidAt).toISOString()).toBe(ngayChuyen);

    const log = await ds.getRepository(AuditLog).findOne({
      where: { action: 'MARK_SETTLEMENT_PAID', entityId: phieu.id },
    });
    expect(log?.detail).toMatchObject({ bankTxnRef: 'FT26102900123' });
  });

  // FR-SETTLE-03: bo trong ngay thi lay dung ky cua tac vu nen; ngay sai dinh dang bi tu choi
  it('chay thu cong: ngay sai dinh dang bi tu choi, bo trong thi lay ky thang truoc', async () => {
    await t.http
      .post('/api/admin/settlements/run')
      .set({ Authorization: `Bearer ${admin}` })
      .send({ periodStart: 'hom qua', periodEnd: 'hom nay' })
      .expect(400);

    await t.http
      .post('/api/admin/settlements/run')
      .set({ Authorization: `Bearer ${admin}` })
      .send({ periodEnd: new Date(Date.now() - 400 * DAY).toISOString() })
      .expect(400); // cuoi ky truoc dau ky

    await t.http.post('/api/admin/settlements/run').set({ Authorization: `Bearer ${admin}` }).send({}).expect(201);
    const log = await ds.getRepository(AuditLog).findOne({
      where: { action: 'RUN_SETTLEMENT' },
      order: { createdAt: 'DESC' },
    });
    expect(log?.detail).toMatchObject({ bySchedule: false });
  });

  // Ban het so luong cua mot chien dich moi cho khach test, tra ve chien dich va ma khach
  async function banVoucher(title: string, quantity: number) {
    const now = Date.now();
    const campaign = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title,
      voucherType: VoucherType.PREPAID,
      salePrice: 40000,
      faceValue: 50000,
      totalQuantity: quantity,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: quantity,
      saleStartAt: new Date(now - DAY),
      saleEndAt: new Date(now + 30 * DAY),
      voucherExpireAt: new Date(now + 90 * DAY),
      status: CampaignStatus.PUBLISHED,
    });
    await ds.getRepository(CampaignStore).save({ campaignId: campaign.id, storeId: ID.store1 });

    const res = await t.http
      .post('/api/orders')
      .set({ Authorization: `Bearer ${customer}` })
      .send({ campaignId: campaign.id, quantity })
      .expect(201);
    const order = res.body.data.order;
    const p = { orderId: order.id, gatewayTxnId: `T-${crypto.randomUUID()}`, amount: Number(order.totalAmount), status: 'SUCCESS' };
    await t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) }).expect(200);
    return { campaign, userId: order.userId as string };
  }

  async function chotKy(ky: { periodStart: string; periodEnd: string }) {
    const res = await t.http
      .post('/api/admin/settlements/run')
      .set({ Authorization: `Bearer ${admin}` })
      .send(ky)
      .expect(201);
    return res.body.data as { brandId: string; id: string }[];
  }
});
