// F06 trang thuong hieu + theo doi, F07 dinh chi thuong hieu, F17 ho so khach, yeu thich kem ten (e2e tren pg-mem)
import { DataSource } from 'typeorm';
import { Brand, User, VoucherCampaign } from '../src/entities';
import { BrandStatus, CampaignStatus } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { ID, TestApp, createTestApp } from './helpers/test-app';

// PNG 1x1 hop le
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('F06 / F07 / F17 (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let admin: string;
  let customer: string;
  const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.dataSource;
    admin = await t.login('admin@voucher.local');
    const user = await ds.getRepository(User).save({ email: 'profile@test.local', role: Role.CUSTOMER, fullName: 'Khach Moi' });
    customer = await t.customerToken(user.id, user.email);
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('F06: trang thuong hieu cong khai (khong can dang nhap) co chi nhanh, chien dich dang ban, so nguoi theo doi', async () => {
    const res = await t.http.get(`/api/brands/${ID.brand}/public`).expect(200);
    expect(res.body.data).toMatchObject({ id: ID.brand, name: 'Highlands Coffee', followerCount: 0 });
    expect(res.body.data.stores.length).toBeGreaterThan(0);
    expect(res.body.data.campaigns.every((c: { status: string }) => ['PUBLISHED', 'SOLD_OUT'].includes(c.status))).toBe(true);

    await t.http.post('/api/favorites').set(bearer(customer)).send({ targetType: 'BRAND', targetId: ID.brand }).expect(201);
    const after = await t.http.get(`/api/brands/${ID.brand}/public`).expect(200);
    expect(after.body.data.followerCount).toBe(1);
  });

  it('yeu thich tra kem ten that cua thuong hieu / chien dich', async () => {
    const campaign = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: ID.campPublished });
    await t.http.post('/api/favorites').set(bearer(customer)).send({ targetType: 'CAMPAIGN', targetId: campaign.id }).expect(201);
    const res = await t.http.get('/api/favorites/me').set(bearer(customer)).expect(200);
    const byType = Object.fromEntries(res.body.data.map((f: { targetType: string }) => [f.targetType, f]));
    expect(byType.BRAND).toMatchObject({ targetId: ID.brand, title: 'Highlands Coffee' });
    expect(byType.CAMPAIGN).toMatchObject({ targetId: campaign.id, title: campaign.title, brandName: 'Highlands Coffee' });
  });

  it('F17: xem va sua ho so, kiem tra so dien thoai va anh dai dien', async () => {
    const me = await t.http.get('/api/users/me').set(bearer(customer)).expect(200);
    expect(me.body.data).toMatchObject({ email: 'profile@test.local', fullName: 'Khach Moi' });

    await t.http.patch('/api/users/me').set(bearer(customer)).send({ phone: '12345' }).expect(400);
    await t.http.patch('/api/users/me').set(bearer(customer)).send({ avatar: 'data:image/gif;base64,R0lGOD' }).expect(400);

    const ok = await t.http
      .patch('/api/users/me')
      .set(bearer(customer))
      .send({ fullName: 'Nguyễn Văn A', phone: '0901234567', avatar: PNG })
      .expect(200);
    expect(ok.body.data).toMatchObject({ fullName: 'Nguyễn Văn A', phone: '0901234567', avatar: PNG });
    await t.http.get('/api/users/me').expect(401);
  });

  it('F07: dinh chi thuong hieu -> chien dich dang ban tam dung, khong mo lai duoc, trang cong khai an; khoi phuc', async () => {
    const owner = await t.login('owner@highlands.local');
    await t.http.patch(`/api/brands/${ID.brand}/suspend`).set(bearer(owner)).send({ reason: 'x' }).expect(403);
    await t.http.patch(`/api/brands/${ID.brand}/suspend`).set(bearer(admin)).send({ reason: '' }).expect(400);

    const res = await t.http.patch(`/api/brands/${ID.brand}/suspend`).set(bearer(admin)).send({ reason: 'Vi phạm điều khoản' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'SUSPENDED', rejectReason: 'Vi phạm điều khoản' });
    expect(res.body.data.pausedCampaigns).toBeGreaterThan(0);

    const camp = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: ID.campPublished });
    expect(camp.status).toBe(CampaignStatus.PAUSED);
    await t.http.patch(`/api/campaigns/${ID.campPublished}/resume`).set(bearer(owner)).expect(400);
    await t.http.get(`/api/brands/${ID.brand}/public`).expect(404);

    const list = await t.http.get('/api/brands').query({ status: 'SUSPENDED' }).set(bearer(admin)).expect(200);
    expect(list.body.data.map((b: { id: string }) => b.id)).toContain(ID.brand);

    await t.http.patch(`/api/brands/${ID.brand}/reinstate`).set(bearer(admin)).expect(200);
    expect((await ds.getRepository(Brand).findOneByOrFail({ id: ID.brand })).status).toBe(BrandStatus.APPROVED);
    await t.http.patch(`/api/campaigns/${ID.campPublished}/resume`).set(bearer(owner)).expect(200);
  });
});
