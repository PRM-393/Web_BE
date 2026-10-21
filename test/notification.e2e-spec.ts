// F16 / F18: kiem thu e2e dich vu thong bao tren PostgreSQL gia lap (pg-mem)
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CampaignStore, Notification, User, VoucherCampaign, VoucherItem } from '../src/entities';
import { CampaignStatus, VoucherItemStatus, VoucherType } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { NotificationService } from '../src/modules/notification/notification.service';
import { PushSender } from '../src/modules/notification/push-sender';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('F16 - thong bao (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  const tokens: Record<string, string> = {};
  const users: Record<string, User> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  async function newCustomer(name: string) {
    users[name] = await ds.getRepository(User).save({ email: `${name}@notify.local`, role: Role.CUSTOMER });
    tokens[name] = await t.customerToken(users[name].id, users[name].email);
  }

  async function newCampaign(title: string) {
    const now = Date.now();
    const c = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title,
      voucherType: VoucherType.PREPAID,
      salePrice: 50000,
      faceValue: 100000,
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
    return c;
  }

  // Mua 1 voucher va thanh toan thanh cong qua webhook co chu ky
  async function buyAndPay(who: string, campaignId: string, txn = `T-${crypto.randomUUID()}`) {
    const res = await t.http.post('/api/orders').set(auth(who)).send({ campaignId, quantity: 1 }).expect(201);
    const order = res.body.data.order;
    const p = { orderId: order.id, gatewayTxnId: txn, amount: Number(order.totalAmount), status: 'SUCCESS' };
    await t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) }).expect(200);
    return { order, payload: { ...p, signature: signWebhook(p) } };
  }

  const myNotifications = async (who: string) =>
    (await t.http.get('/api/notifications/me').set(auth(who)).expect(200)).body;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret';
    t = await createTestApp();
    ds = t.dataSource;
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('thanh toan xong co thong bao "voucher da ve vi"; webhook trung khong bao lai', async () => {
    await newCustomer('quang');
    const c = await newCampaign('Combo trua');
    const { payload } = await buyAndPay('quang', c.id);
    await t.http.post('/api/orders/payment-webhook').send(payload).expect(200);

    const body = await myNotifications('quang');
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({ type: 'VOUCHER_ISSUED', title: 'Voucher đã về ví', readAt: null });
    expect(body.data.items[0].body).toContain('Combo trua');
    expect(body.data.items[0].data.orderId).toBeTruthy();
    expect(body.data.unread).toBe(1);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it('cua hang redeem xong khach nhan thong bao "da su dung" kem ten chi nhanh (FR-REDEEM-09)', async () => {
    await newCustomer('lan');
    const c = await newCampaign('Tra sua size L');
    await buyAndPay('lan', c.id);
    const item = await ds.getRepository(VoucherItem).findOneByOrFail({ userId: users.lan.id });
    const token = await t.http.post('/api/redeem/token').set(auth('lan')).send({ voucherItemId: item.id }).expect(201);

    tokens.staff = await t.login('staff@highlands.local');
    await t.http.post('/api/auth/select-store').set(auth('staff')).send({ storeId: ID.store1 }).expect(201);
    await t.http
      .post('/api/redeem')
      .set(auth('staff'))
      .send({ storeId: ID.store1, otpCode: token.body.data.otpCode })
      .expect(201);

    const used = (await myNotifications('lan')).data.items.find((n: { type: string }) => n.type === 'VOUCHER_USED');
    expect(used).toMatchObject({ title: 'Đã sử dụng voucher', data: { voucherItemId: item.id } });
    expect(used.body).toContain('Tra sua size L');
    expect(used.body).toContain('Highlands');
  });

  it('hoan tien xong khach nhan thong bao ket qua (FR-REFUND-09)', async () => {
    await newCustomer('minh');
    const c = await newCampaign('Banh mi');
    await buyAndPay('minh', c.id);
    const item = await ds.getRepository(VoucherItem).findOneByOrFail({ userId: users.minh.id });
    const refund = await t.http.post('/api/refunds').set(auth('minh')).send({ voucherItemId: item.id, reason: 'doi y' }).expect(201);
    expect(refund.body.data.status).toBe('COMPLETED');

    const result = (await myNotifications('minh')).data.items.find((n: { type: string }) => n.type === 'REFUND_RESULT');
    expect(result).toMatchObject({ title: 'Kết quả hoàn tiền', data: { refundId: refund.body.data.id, status: 'COMPLETED' } });

    // voucher da hoan khong hoan lai duoc: bao tu choi
    const again = await t.http.post('/api/refunds').set(auth('minh')).send({ voucherItemId: item.id }).expect(201);
    expect(again.body.data.status).toBe('REJECTED');
    const rejected = (await myNotifications('minh')).data.items.filter((n: { type: string }) => n.type === 'REFUND_RESULT');
    expect(rejected).toHaveLength(2);
    expect(rejected[0].body).toContain('từ chối');
  });

  it('danh dau da doc tung thong bao va tat ca', async () => {
    await newCustomer('rin');
    const c = await newCampaign('Tra sua');
    await buyAndPay('rin', c.id);
    await buyAndPay('rin', c.id);
    const list = await myNotifications('rin');
    expect(list.data.unread).toBe(2);

    await t.http.patch(`/api/notifications/${list.data.items[0].id}/read`).set(auth('rin')).expect(200);
    expect((await myNotifications('rin')).data.unread).toBe(1);

    const all = await t.http.patch('/api/notifications/read-all').set(auth('rin')).expect(200);
    expect(all.body.data.updated).toBe(1);
    expect((await myNotifications('rin')).data.unread).toBe(0);

    // Khong doc duoc thong bao cua nguoi khac
    await newCustomer('son');
    await t.http.patch(`/api/notifications/${list.data.items[0].id}/read`).set(auth('son')).expect(404);
  });

  it('tat nhom "voucher da phat hanh" thi khong nhan nua (FR-ENGAGE-07)', async () => {
    await newCustomer('tam');
    const settings = await t.http.get('/api/notifications/settings').set(auth('tam')).expect(200);
    expect(settings.body.data).toHaveLength(5);
    expect(settings.body.data.every((s: { enabled: boolean }) => s.enabled)).toBe(true);

    const updated = await t.http
      .put('/api/notifications/settings')
      .set(auth('tam'))
      .send({ type: 'VOUCHER_ISSUED', enabled: false })
      .expect(200);
    expect(updated.body.data.find((s: { type: string }) => s.type === 'VOUCHER_ISSUED').enabled).toBe(false);
    await t.http.put('/api/notifications/settings').set(auth('tam')).send({ type: 'KHONG_CO', enabled: false }).expect(400);

    const c = await newCampaign('Banh mi');
    await buyAndPay('tam', c.id);
    expect((await myNotifications('tam')).data.items).toHaveLength(0);
  });

  it('job nhac voucher het han sau 7 ngay va 1 ngay; chay lai khong gui trung (FR-ENGAGE-07)', async () => {
    await newCustomer('uyen');
    const c = await newCampaign('Ve xem phim');
    // Tao 4 voucher bang luong mua that roi doi han su dung de kiem tra cac moc
    for (let i = 0; i < 4; i++) await buyAndPay('uyen', c.id);
    await t.http.patch('/api/notifications/read-all').set(auth('uyen')).expect(200);
    await ds.getRepository(Notification).delete({ userId: users.uyen.id });

    const repo = ds.getRepository(VoucherItem);
    const vouchers = await repo.find({ where: { userId: users.uyen.id }, order: { code: 'ASC' } });
    expect(vouchers).toHaveLength(4);
    const now = new Date();
    const at = (ms: number) => new Date(now.getTime() + ms);
    await repo.update(vouchers[0].id, { expireAt: at(6.5 * DAY) }); // nhac moc 7 ngay
    await repo.update(vouchers[1].id, { expireAt: at(0.5 * DAY) }); // nhac moc 1 ngay
    await repo.update(vouchers[2].id, { expireAt: at(3 * DAY) }); // chua den moc nao
    await repo.update(vouchers[3].id, { expireAt: at(0.5 * DAY), status: VoucherItemStatus.USED }); // da dung: bo qua

    const service = t.app.get(NotificationService);
    expect(await service.remindExpiringVouchers(now)).toBe(2);
    expect(await service.remindExpiringVouchers(now)).toBe(0);

    const list = await myNotifications('uyen');
    expect(list.data.items.map((n: { type: string }) => n.type)).toEqual(['VOUCHER_EXPIRING', 'VOUCHER_EXPIRING']);
    expect(list.data.items.map((n: { title: string }) => n.title).sort()).toEqual(['Voucher hết hạn ngày mai', 'Voucher sắp hết hạn']);
  });

  it('dang ky thiet bi nhan push: kiem tra du lieu, dang ky lai khong tao trung', async () => {
    await newCustomer('vy');
    await t.http.post('/api/notifications/device-token').set(auth('vy')).send({ token: 'abc', platform: 'symbian' }).expect(400);
    await t.http.post('/api/notifications/device-token').set(auth('vy')).send({ token: 'fcm-token-1', platform: 'android' }).expect(201);
    await t.http.post('/api/notifications/device-token').set(auth('vy')).send({ token: 'fcm-token-1', platform: 'android' }).expect(201);
    const rows = await ds.query(`SELECT count(*)::int AS n FROM device_tokens WHERE token = 'fcm-token-1'`);
    expect(rows[0].n).toBe(1);
  });

  it('chua cau hinh Firebase thi khong gui push nhung van luu thong bao', async () => {
    expect(t.app.get(PushSender).configured).toBe(false);
    expect(await t.app.get(PushSender).send(['x'], { title: 'a', body: 'b' })).toBe(0);
    expect(await ds.getRepository(Notification).count()).toBeGreaterThan(0);
  });

  it('can dang nhap moi xem duoc thong bao', async () => {
    await t.http.get('/api/notifications/me').expect(401);
  });
});
