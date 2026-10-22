// F07 / T5: kiem thu e2e chi nhanh va nhan vien tren PostgreSQL gia lap (pg-mem).
// Unit test kiem phan logic bang repository gia; file nay chay API that tu dau den cuoi de chung minh
// ba moc "Xong khi" cua T5: BR-19 (gan nhan vien), DC-05 (toa do), BR-24 (chi nhanh cuoi cung).
//
// Cac ca chay tuan tu tren cung mot CSDL va co chu y xep thu tu: ca BR-24 vo hieu hoa chi nhanh truoc
// roi ca sau moi mo lai, nen dung doi cho nhau.
import { TestApp, createTestApp } from './helpers/test-app';

// Id co dinh trong database/generate-seed.ts
const SEED = {
  brandHighlands: '33333333-0000-4000-8000-000000000001',
  storeLeLoi: '44444444-0000-4000-8000-000000000001',
  storeNguyenHue: '44444444-0000-4000-8000-000000000002',
  // Chi nhanh cua Phuc Long - thuong hieu khac
  storePhucLong: '44444444-0000-4000-8000-000000000003',
  // Chien dich PUBLISHED cua Highlands, ap dung tai Le Loi + Nguyen Hue, con mot voucher ACTIVE
  campaignTitle: 'Voucher 100.000đ chỉ 80.000đ',
  staffAtLeLoi: '55555555-0000-4000-8000-000000000001',
};

describe('F07 - chi nhanh va nhan vien (e2e)', () => {
  let t: TestApp;
  let owner: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const newStore = {
    name: 'Highlands Thu Duc',
    address: '12 Vo Van Ngan',
    latitude: 10.8494,
    longitude: 106.7537,
  };

  beforeAll(async () => {
    t = await createTestApp();
    owner = await t.login('owner@highlands.local');
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('DC-05: khong tao duoc chi nhanh thieu toa do, du toa do thi tao duoc', async () => {
    const { latitude: _lat, ...thieuToaDo } = newStore;
    await t.http
      .post(`/api/brands/${SEED.brandHighlands}/stores`)
      .set(auth(owner))
      .send(thieuToaDo)
      .expect(400);

    const created = await t.http
      .post(`/api/brands/${SEED.brandHighlands}/stores`)
      .set(auth(owner))
      .send(newStore)
      .expect(201);
    expect(created.body.data).toMatchObject({ name: newStore.name, status: true });
  });

  it('DC-05: sua chi nhanh dang hoat dong ma xoa toa do thi bi tu choi', async () => {
    const res = await t.http
      .patch(`/api/brands/stores/${SEED.storeLeLoi}`)
      .set(auth(owner))
      .send({ latitude: null })
      .expect(400);
    expect(res.body.error.message).toContain('DC-05');

    // Sua cac truong khac thi binh thuong (FR-BRAND-04)
    const ok = await t.http
      .patch(`/api/brands/stores/${SEED.storeLeLoi}`)
      .set(auth(owner))
      .send({ openingHours: '07:00 - 23:00' })
      .expect(200);
    expect(ok.body.data.openingHours).toBe('07:00 - 23:00');
  });

  it('BR-19 / DC-14: khong gan duoc nhan vien sang chi nhanh cua thuong hieu khac', async () => {
    await t.http
      .post('/api/brands/staff')
      .set(auth(owner))
      .send({ email: 'nv-moi@highlands.vn', storeId: SEED.storePhucLong })
      .expect(403);

    // Chi nhanh cua chinh thuong hieu thi gan duoc
    await t.http
      .post('/api/brands/staff')
      .set(auth(owner))
      .send({ email: 'nv-moi@highlands.vn', storeId: SEED.storeLeLoi })
      .expect(201);
  });

  it('FR-BRAND-05: gan trung chi nhanh bi tu choi, gan them chi nhanh khac thi duoc', async () => {
    await t.http
      .post('/api/brands/staff')
      .set(auth(owner))
      .send({ email: 'nv-moi@highlands.vn', storeId: SEED.storeLeLoi })
      .expect(400);

    await t.http
      .post('/api/brands/staff')
      .set(auth(owner))
      .send({ email: 'nv-moi@highlands.vn', storeId: SEED.storeNguyenHue })
      .expect(201);

    const staff = await t.http.get(`/api/brands/${SEED.brandHighlands}/staff`).set(auth(owner)).expect(200);
    const rows = staff.body.data.filter((s: { email: string }) => s.email === 'nv-moi@highlands.vn');
    expect(rows).toHaveLength(2);
  });

  it('BR-24: khong vo hieu duoc chi nhanh ap dung cuoi cung cua chien dich con voucher', async () => {
    // Chien dich ap dung o ca Le Loi va Nguyen Hue, nen bo mot chi nhanh van con cho dung
    await t.http.patch(`/api/brands/stores/${SEED.storeNguyenHue}/deactivate`).set(auth(owner)).expect(200);

    // Gio Le Loi la chi nhanh cuoi cung con hoat dong, ma khach van con voucher ACTIVE
    const res = await t.http
      .patch(`/api/brands/stores/${SEED.storeLeLoi}/deactivate`)
      .set(auth(owner))
      .expect(400);
    expect(res.body.error.message).toContain(SEED.campaignTitle);
    expect(res.body.error.message).toContain('BR-24');

    // Sua chi nhanh voi status = false cung phai qua cung cua ay, khong di duong vong duoc
    await t.http
      .patch(`/api/brands/stores/${SEED.storeLeLoi}`)
      .set(auth(owner))
      .send({ status: false })
      .expect(400);
  });

  it('FR-BRAND-04: mo lai chi nhanh thi chien dich co cho dung tro lai, luc do vo hieu duoc chi nhanh kia', async () => {
    await t.http
      .patch(`/api/brands/stores/${SEED.storeNguyenHue}`)
      .set(auth(owner))
      .send({ status: true })
      .expect(200);

    await t.http.patch(`/api/brands/stores/${SEED.storeLeLoi}/deactivate`).set(auth(owner)).expect(200);

    const stores = await t.http.get(`/api/brands/${SEED.brandHighlands}/stores`).set(auth(owner)).expect(200);
    const byId = Object.fromEntries(stores.body.data.map((s: { id: string }) => [s.id, s]));
    expect(byId[SEED.storeLeLoi].status).toBe(false);
    expect(byId[SEED.storeNguyenHue].status).toBe(true);
  });

  it('FR-BRAND-06 / FR-AUTH-10: vo hieu nhan vien thu hoi moi phien ngay lap tuc', async () => {
    const staffToken = await t.login('staff@highlands.local');
    await t.http.get('/api/notifications/me').set(auth(staffToken)).expect(200);

    await t.http.patch(`/api/brands/staff/${SEED.staffAtLeLoi}/deactivate`).set(auth(owner)).expect(200);

    // Access token cu van con han nhung phien da bi thu hoi, request tiep theo phai bi tu choi ngay
    await t.http.get('/api/notifications/me').set(auth(staffToken)).expect(401);
  });
});
