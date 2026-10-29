// F08 / T6: kiem thu e2e quyen so huu thuong hieu (NFR-SEC-03) tren PostgreSQL gia lap (pg-mem).
// Unit test o src/common/guards/brand-resource.guard.spec.ts kiem phan logic dieu huong cua guard;
// file nay goi API that de chung minh moc "Xong khi" cua T6: chu thuong hieu Phuc Long dang nhap hop le,
// co token con han, dung vai tro BRAND_OWNER, nhung dong vao du lieu cua Highlands thi phai nhan 403.
//
// Moi route danh cho BRAND_OWNER cua CampaignController va BrandController deu duoc thu mot luot,
// de khong con route nao chi dua vao viec giao dien an nut.
import { TestApp, createTestApp } from './helpers/test-app';

// Id co dinh trong database/generate-seed.ts
const HIGHLANDS = {
  brand: '33333333-0000-4000-8000-000000000001',
  store: '44444444-0000-4000-8000-000000000001', // Highlands Le Loi
  campPublished: '66666666-0000-4000-8000-000000000001',
  campDraft: '66666666-0000-4000-8000-000000000002',
  campPending: '66666666-0000-4000-8000-000000000003',
  assignment: '55555555-0000-4000-8000-000000000001', // nhan vien tai Le Loi
};

const PHUC_LONG = {
  brand: '33333333-0000-4000-8000-000000000002',
  store: '44444444-0000-4000-8000-000000000003', // Phuc Long Le Van Sy
  campaign: '66666666-0000-4000-8000-000000000004',
};

describe('F08 - quyen so huu thuong hieu (e2e)', () => {
  let t: TestApp;
  // Chu Phuc Long: nguoi la doi voi moi du lieu cua Highlands
  let nguoiLa: string;
  let chuHighlands: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp();
    nguoiLa = await t.login('owner@phuclong.local');
    chuHighlands = await t.login('owner@highlands.local');
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('moc "Xong khi" T6: sua chien dich cua thuong hieu khac tra 403', async () => {
    const res = await t.http
      .patch(`/api/campaigns/${HIGHLANDS.campDraft}`)
      .set(auth(nguoiLa))
      .send({ title: 'Doi ten chien dich cua nguoi khac' })
      .expect(403);
    expect(res.body.error.message).toContain('không có quyền');

    // Chu that su cua chien dich van sua binh thuong - guard khong chan nham
    const ok = await t.http
      .patch(`/api/campaigns/${HIGHLANDS.campDraft}`)
      .set(auth(chuHighlands))
      .send({ title: 'Combo bánh mì + cà phê sữa (đã sửa)' })
      .expect(200);
    expect(ok.body.data.title).toBe('Combo bánh mì + cà phê sữa (đã sửa)');
  });

  it('CampaignController: moi route theo :id cua chien dich nguoi khac deu tra 403', async () => {
    const h = HIGHLANDS;
    await t.http.patch(`/api/campaigns/${h.campDraft}/submit`).set(auth(nguoiLa)).expect(403);
    await t.http.patch(`/api/campaigns/${h.campPending}/withdraw`).set(auth(nguoiLa)).expect(403);
    await t.http.patch(`/api/campaigns/${h.campPublished}/pause`).set(auth(nguoiLa)).expect(403);
    await t.http.patch(`/api/campaigns/${h.campPublished}/resume`).set(auth(nguoiLa)).expect(403);
    await t.http.get(`/api/campaigns/${h.campPublished}/stock`).set(auth(nguoiLa)).expect(403);
  });

  it('CampaignController: doc / tao chien dich duoi ma thuong hieu nguoi khac tra 403', async () => {
    await t.http.get(`/api/campaigns/brand/${HIGHLANDS.brand}`).set(auth(nguoiLa)).expect(403);

    await t.http
      .post(`/api/campaigns/brand/${HIGHLANDS.brand}`)
      .set(auth(nguoiLa))
      .send(campaignMoi([HIGHLANDS.store]))
      .expect(403);
  });

  // FR-CAMP-03 / DC-07: ma thuong hieu dung cua minh nhung chi nhanh ap dung lai cua thuong hieu khac
  it('FR-CAMP-03: tao chien dich tro toi chi nhanh cua thuong hieu khac tra 403', async () => {
    await t.http
      .post(`/api/campaigns/brand/${PHUC_LONG.brand}`)
      .set(auth(nguoiLa))
      .send(campaignMoi([HIGHLANDS.store]))
      .expect(403);

    // Chi nhanh cua chinh minh thi tao duoc
    await t.http
      .post(`/api/campaigns/brand/${PHUC_LONG.brand}`)
      .set(auth(nguoiLa))
      .send(campaignMoi([PHUC_LONG.store]))
      .expect(201);
  });

  it('BrandController: moi route theo chi nhanh / nhan vien cua thuong hieu khac tra 403', async () => {
    const h = HIGHLANDS;
    await t.http.get(`/api/brands/${h.brand}/stores`).set(auth(nguoiLa)).expect(403);
    await t.http.get(`/api/brands/${h.brand}/staff`).set(auth(nguoiLa)).expect(403);
    await t.http
      .post(`/api/brands/${h.brand}/stores`)
      .set(auth(nguoiLa))
      .send({ name: 'Chi nhanh chen vao', address: '1 Le Loi', latitude: 10.77, longitude: 106.69 })
      .expect(403);
    await t.http
      .patch(`/api/brands/stores/${h.store}`)
      .set(auth(nguoiLa))
      .send({ name: 'Doi ten chi nhanh nguoi khac' })
      .expect(403);
    await t.http.patch(`/api/brands/stores/${h.store}/deactivate`).set(auth(nguoiLa)).expect(403);
    // BR-19 / DC-14: chi gan nhan vien vao chi nhanh cua chinh thuong hieu minh
    await t.http
      .post('/api/brands/staff')
      .set(auth(nguoiLa))
      .send({ email: 'nv-chen@phuclong.vn', storeId: h.store })
      .expect(403);
    await t.http.patch(`/api/brands/staff/${h.assignment}/deactivate`).set(auth(nguoiLa)).expect(403);
  });

  it('BrandController: route doc du lieu cua chinh minh khong bi guard chan', async () => {
    const res = await t.http.get('/api/brands/me').set(auth(nguoiLa)).expect(200);
    // Service loc theo userId nen chi thay thuong hieu cua chinh minh
    expect(res.body.data.map((b: { id: string }) => b.id)).toEqual([PHUC_LONG.brand]);
  });

  it('route cua quan tri vien khong mo cho chu thuong hieu (FR-AUTH-07)', async () => {
    await t.http.patch(`/api/campaigns/${HIGHLANDS.campPending}/approve`).set(auth(nguoiLa)).expect(403);
    await t.http.patch(`/api/brands/${HIGHLANDS.brand}/approve`).set(auth(nguoiLa)).expect(403);
    await t.http.get('/api/campaigns/pending').set(auth(nguoiLa)).expect(403);
  });
});

// Chien dich hop le theo BR-21 / FR-CAMP-12 de 403 (neu co) chac chan den tu guard chu khong tu validate
function campaignMoi(storeIds: string[]) {
  const ngay = (soNgay: number) => new Date(Date.now() + soNgay * 86400000).toISOString();
  return {
    title: 'Chien dich kiem thu quyen so huu',
    voucherType: 'PREPAID',
    salePrice: 80000,
    faceValue: 100000,
    totalQuantity: 10,
    saleStartAt: ngay(1),
    saleEndAt: ngay(20),
    voucherExpireAt: ngay(40),
    storeIds,
  };
}
