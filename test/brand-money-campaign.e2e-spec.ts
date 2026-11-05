// Dong tien tren bao cao, dang ky thuong hieu cong khai, sua / xoa chien dich (e2e tren pg-mem)
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { CampaignStore, Settlement, User, VoucherCampaign, VoucherItem } from '../src/entities';
import { CampaignStatus, SettlementStatus, UserStatus, VoucherItemStatus, VoucherType } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { signWebhook } from '../src/modules/order/payment-gateway';
import { SettlementService } from '../src/modules/settlement/settlement.service';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('Dong tien, dang ky thuong hieu, sua xoa chien dich (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let owner: Record<string, string>;
  let admin: Record<string, string>;
  let customer: Record<string, string>;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret';
    t = await createTestApp();
    ds = t.dataSource;
    owner = { Authorization: `Bearer ${await t.login('owner@highlands.local')}` };
    admin = { Authorization: `Bearer ${await t.login('admin@voucher.local')}` };
    const user = await ds.getRepository(User).save({ email: 'money@test.local', role: Role.CUSTOMER });
    customer = { Authorization: `Bearer ${await t.customerToken(user.id, user.email)}` };
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  const newCampaign = async (over: Partial<VoucherCampaign> = {}) => {
    const now = Date.now();
    const c = await ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title: 'Chien dich test ' + crypto.randomUUID(),
      voucherType: VoucherType.PREPAID,
      salePrice: 100000,
      faceValue: 120000,
      totalQuantity: 10,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: 5,
      saleStartAt: new Date(now - DAY),
      saleEndAt: new Date(now + 30 * DAY),
      voucherExpireAt: new Date(now + 90 * DAY),
      status: CampaignStatus.PUBLISHED,
      ...over,
    });
    await ds.getRepository(CampaignStore).save({ campaignId: c.id, storeId: ID.store1 });
    return c;
  };
  const buy = async (campaignId: string, quantity: number) => {
    const res = await t.http.post('/api/orders').set(customer).send({ campaignId, quantity }).expect(201);
    const order = res.body.data.order;
    const p = { orderId: order.id, gatewayTxnId: `T-${crypto.randomUUID()}`, amount: Number(order.totalAmount), status: 'SUCCESS' };
    await t.http.post('/api/orders/payment-webhook').send({ ...p, signature: signWebhook(p) }).expect(200);
    return order.id as string;
  };

  it('bao cao: gop, hoan, thuan, hoa hong, phai tra, da tra va con lai khop nhau', async () => {
    const c = await newCampaign();
    const orderId = await buy(c.id, 3);
    const items = await ds.getRepository(VoucherItem).find({ where: { orderId } });
    // 1 voucher hoan, 1 voucher da dung va da chi tra qua doi soat, 1 voucher con hieu luc
    await ds.getRepository(VoucherItem).update(items[0].id, { status: VoucherItemStatus.REFUNDED });
    await ds.getRepository(VoucherItem).update(items[1].id, { status: VoucherItemStatus.USED, usedAt: new Date() });

    const url = `/api/brands/${ID.brand}/report`;
    const before = (await t.http.get(url).query({ campaignId: c.id }).set(owner).expect(200)).body.data;
    expect(before).toMatchObject({
      grossRevenue: 300000, refundedAmount: 100000, totalRevenue: 200000,
      totalCommission: 20000, brandPayable: 180000, brandPaid: 0, brandUnpaid: 180000,
    });

    const now = Date.now();
    await t.app.get(SettlementService).runMonthlySettlement(new Date(now - DAY), new Date(now + DAY));
    await ds.getRepository(Settlement).update({ brandId: ID.brand }, { status: SettlementStatus.PAID, paidAt: new Date() });

    const after = (await t.http.get(url).query({ campaignId: c.id }).set(owner).expect(200)).body.data;
    expect(after).toMatchObject({ brandPayable: 180000, brandPaid: 90000, brandUnpaid: 90000 });

    const dash = (await t.http.get('/api/admin/dashboard').set(admin).expect(200)).body.data;
    expect(dash.totalRevenue).toBe(dash.grossRevenue - dash.refundedAmount);
    expect(dash.brandPayable).toBe(dash.totalRevenue - dash.totalCommission);
    expect(dash.brandUnpaid).toBe(dash.brandPayable - dash.brandPaid);
    expect(dash.brandPaid).toBeGreaterThanOrEqual(90000);
  });

  describe('dang ky thuong hieu cong khai', () => {
    const form = (ownerEmail: string) => ({ ownerEmail, ownerFullName: 'Nguoi Dai Dien', name: 'Thuong hieu ' + ownerEmail });

    it('khong can dang nhap: tao chu thuong hieu cho kich hoat va ho so cho duyet', async () => {
      const res = await t.http.post('/api/brands/register').send(form('Moi@Brand.local')).expect(201);
      expect(res.body.data.status).toBe('PENDING');
      const user = await ds.getRepository(User).findOneByOrFail({ email: 'moi@brand.local' });
      expect(user.role).toBe(Role.BRAND_OWNER);
      expect(user.status).toBe(UserStatus.PENDING_ACTIVATION);
      await t.http.post('/api/brands/register').send(form('moi@brand.local')).expect(400);
    });

    it('khong gan duoc ho so vao tai khoan da kich hoat hoac tai khoan vai tro khac', async () => {
      await ds.getRepository(User).save({ email: 'chua-co-brand@test.local', role: Role.BRAND_OWNER, status: UserStatus.ACTIVE });
      const res = await t.http.post('/api/brands/register').send(form('chua-co-brand@test.local')).expect(400);
      expect(res.body.error.message).toContain('đăng nhập');
      await t.http.post('/api/brands/register').send(form('money@test.local')).expect(400);
    });

    it('thieu thong tin bat buoc thi tu choi', async () => {
      await t.http.post('/api/brands/register').send({ ownerEmail: 'sai', ownerFullName: '', name: '' }).expect(400);
    });
  });

  describe('sua chien dich', () => {
    it('da ban: gui lai dung gia cu van luu duoc va phai duyet lai; doi gia thi tu choi', async () => {
      const c = await newCampaign();
      await buy(c.id, 1);
      const res = await t.http.patch(`/api/campaigns/${c.id}`).set(owner).send({
        title: 'Ten moi ' + c.id,
        salePrice: 100000,
        faceValue: 120000,
        voucherExpireAt: new Date(c.voucherExpireAt).toISOString(),
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(CampaignStatus.PENDING);
      await t.http.patch(`/api/campaigns/${c.id}/withdraw`).set(owner).expect(200);
      await t.http.patch(`/api/campaigns/${c.id}`).set(owner).send({ salePrice: 90000 }).expect(400);
    });

    it('khong giam so luong duoi muc da ban; khong sua chien dich da ket thuc', async () => {
      const c = await newCampaign();
      await buy(c.id, 2);
      await t.http.patch(`/api/campaigns/${c.id}`).set(owner).send({ totalQuantity: 1 }).expect(400);
      const ended = await newCampaign({ status: CampaignStatus.ENDED });
      await t.http.patch(`/api/campaigns/${ended.id}`).set(owner).send({ title: 'x' }).expect(400);
    });
  });

  describe('xoa chien dich', () => {
    it('chua co don: chu thuong hieu xoa duoc; khach va chua dang nhap thi khong', async () => {
      const c = await newCampaign({ status: CampaignStatus.DRAFT });
      await t.http.delete(`/api/campaigns/${c.id}`).set(customer).expect(403);
      await t.http.delete(`/api/campaigns/${c.id}`).expect(401);
      await t.http.delete(`/api/campaigns/${c.id}`).set(owner).expect(200);
      expect(await ds.getRepository(VoucherCampaign).findOneBy({ id: c.id })).toBeNull();
    });

    it('chu thuong hieu khac khong xoa duoc', async () => {
      const c = await newCampaign({ status: CampaignStatus.DRAFT, brandId: ID.brand });
      const other = await ds.getRepository(User).save({ email: 'owner-khac@test.local', role: Role.BRAND_OWNER, status: UserStatus.ACTIVE });
      const token = t.app.get(JwtService).sign(
        { sub: other.id, email: other.email, role: Role.BRAND_OWNER, type: 'access' },
        { secret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret' },
      );
      const res = await t.http.delete(`/api/campaigns/${c.id}`).set({ Authorization: `Bearer ${token}` });
      expect([401, 403]).toContain(res.status);
      expect(await ds.getRepository(VoucherCampaign).findOneBy({ id: c.id })).not.toBeNull();
    });

    it('da co don hoac dang cho duyet: khong xoa duoc', async () => {
      const sold = await newCampaign();
      await buy(sold.id, 1);
      await t.http.delete(`/api/campaigns/${sold.id}`).set(owner).expect(400);
      const pending = await newCampaign({ status: CampaignStatus.PENDING });
      await t.http.delete(`/api/campaigns/${pending.id}`).set(owner).expect(400);
      expect(await ds.getRepository(VoucherCampaign).findOneBy({ id: sold.id })).not.toBeNull();
    });
  });
});
