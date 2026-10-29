// F07 / F08 / F06: dang ky ho so thuong hieu (T9), duyet / tu choi kem ly do va email (T8, T10),
// mo lai chien dich da ket thuc (T7), danh gia cong khai khong bi chan thua (T14).
// Chay SQL that tren PostgreSQL gia lap (pg-mem).
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { AuditLog, Brand, User, VoucherCampaign } from '../src/entities';
import { BrandStatus, CampaignStatus, UserStatus, VoucherType } from '../src/common/enums/status.enum';
import { Role } from '../src/common/enums/role.enum';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;
// Thuong hieu Circle K trong seed dang o trang thai PENDING - dung lam ca duyet / tu choi
const CIRCLE_K = '33333333-0000-4000-8000-000000000006';

describe('F07 / F08 - dang ky, duyet ho so va mo lai chien dich (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let admin: string;
  let phucLong: string;
  const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.dataSource;
    admin = await t.login('admin@voucher.local');
    phucLong = await t.login('owner@phuclong.local');
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  // ---- T9: FR-BRAND-01 / FR-BRAND-02 -------------------------------------
  it('dang ky cong khai tao chu thuong hieu PENDING_ACTIVATION + ho so PENDING va gui lien ket dat mat khau', async () => {
    const res = await t.http
      .post('/api/brands/register')
      .send({
        ownerEmail: 'chu@banhmi.vn',
        ownerFullName: 'Tran Thi B',
        name: 'Banh Mi Sai Gon',
        contactInfo: '0912345678',
      })
      .expect(201);

    expect(res.body.data.status).toBe(BrandStatus.PENDING);

    const user = await ds.getRepository(User).findOne({ where: { email: 'chu@banhmi.vn' } });
    expect(user).toMatchObject({ role: Role.BRAND_OWNER, status: UserStatus.PENDING_ACTIVATION });

    const brand = await ds.getRepository(Brand).findOne({ where: { id: res.body.data.brandId } });
    expect(brand).toMatchObject({ name: 'Banh Mi Sai Gon', ownerUserId: user!.id, status: BrandStatus.PENDING });

    // Lien ket dat mat khau da duoc gui (MailService bi thay bang ban ghi nho trong test)
    const mail = t.emails.find((m) => m.to === 'chu@banhmi.vn');
    expect(mail?.text).toContain('/activate');

    // Ho so moi hien ngay o hang cho duyet cua quan tri vien
    const pending = await t.http.get('/api/brands').query({ status: 'PENDING' }).set(bearer(admin)).expect(200);
    expect(pending.body.data.map((b: { id: string }) => b.id)).toContain(res.body.data.brandId);
  });

  it('dang ky lai bang email da co ho so thi bi tu choi, khong sinh ho so thu hai', async () => {
    await t.http
      .post('/api/brands/register')
      .send({ ownerEmail: 'chu@banhmi.vn', ownerFullName: 'Tran Thi B', name: 'Banh Mi Sai Gon 2' })
      .expect(400);
    expect(await ds.getRepository(Brand).count({ where: { name: 'Banh Mi Sai Gon 2' } })).toBe(0);
  });

  it('email thieu hoac ho ten rong thi bi tu choi ngay o DTO', async () => {
    await t.http.post('/api/brands/register').send({ name: 'Thieu email', ownerFullName: 'A' }).expect(400);
    await t.http
      .post('/api/brands/register')
      .send({ ownerEmail: 'khong-phai-email', ownerFullName: 'A', name: 'Sai email' })
      .expect(400);
  });

  // ---- T10: FR-BRAND-03 / UC-06 ------------------------------------------
  it('tu choi ho so khong co ly do (hoac ly do qua ngan) bi chan; du thi gui email kem ly do + ghi AuditLog', async () => {
    await t.http.patch(`/api/brands/${CIRCLE_K}/reject`).set(bearer(admin)).send({}).expect(400);
    await t.http.patch(`/api/brands/${CIRCLE_K}/reject`).set(bearer(admin)).send({ reason: '   ' }).expect(400);
    await t.http.patch(`/api/brands/${CIRCLE_K}/reject`).set(bearer(admin)).send({ reason: 'khong' }).expect(400);

    const lyDo = 'Giấy phép kinh doanh không khớp tên thương hiệu đăng ký.';
    const res = await t.http.patch(`/api/brands/${CIRCLE_K}/reject`).set(bearer(admin)).send({ reason: lyDo }).expect(200);
    expect(res.body.data).toMatchObject({ status: BrandStatus.REJECTED, rejectReason: lyDo });

    const mail = t.emails.find((m) => m.to === 'owner@circlek.local');
    expect(mail?.text).toContain(lyDo);
    const log = await ds.getRepository(AuditLog).findOne({ where: { action: 'REJECT_BRAND', entityId: CIRCLE_K } });
    expect(log?.detail).toMatchObject({ reason: lyDo });
  });

  it('duyet ho so khong o trang thai cho duyet thi bi chan (ho so vua bi tu choi o tren)', async () => {
    await t.http.patch(`/api/brands/${CIRCLE_K}/approve`).set(bearer(admin)).expect(400);
  });

  it('duyet ho so dang cho: ghi AuditLog va gui email cho chu thuong hieu', async () => {
    const dangKy = await t.http
      .post('/api/brands/register')
      .send({ ownerEmail: 'chu@chao.vn', ownerFullName: 'Le Van C', name: 'Chao Long Co Ba' })
      .expect(201);
    const brandId = dangKy.body.data.brandId;

    const res = await t.http.patch(`/api/brands/${brandId}/approve`).set(bearer(admin)).expect(200);
    expect(res.body.data.status).toBe(BrandStatus.APPROVED);
    expect(res.body.data.approvedAt).toBeTruthy();

    const log = await ds.getRepository(AuditLog).findOne({ where: { action: 'APPROVE_BRAND', entityId: brandId } });
    expect(log).toBeTruthy();
    expect(t.emails.filter((m) => m.to === 'chu@chao.vn').length).toBeGreaterThanOrEqual(2); // kich hoat + duyet
  });

  // ---- T8: UC-04 luong 3a ------------------------------------------------
  it('tu choi chien dich bat buoc kem ly do, va chi tu choi duoc chien dich dang cho duyet', async () => {
    const campaign = await newCampaign(CampaignStatus.PENDING);

    await t.http.patch(`/api/campaigns/${campaign.id}/reject`).set(bearer(admin)).send({}).expect(400);
    await t.http.patch(`/api/campaigns/${campaign.id}/reject`).set(bearer(admin)).send({ reason: 'ko' }).expect(400);

    const lyDo = 'Hạn sử dụng quá sát ngày kết thúc bán, vui lòng giãn thêm.';
    const res = await t.http
      .patch(`/api/campaigns/${campaign.id}/reject`)
      .set(bearer(admin))
      .send({ reason: lyDo })
      .expect(200);
    expect(res.body.data).toMatchObject({ status: CampaignStatus.DRAFT, rejectReason: lyDo });

    // Da ve DRAFT roi thi khong tu choi lan nua duoc
    await t.http.patch(`/api/campaigns/${campaign.id}/reject`).set(bearer(admin)).send({ reason: lyDo }).expect(400);
  });

  // ---- T7: FR-CAMP-15 ----------------------------------------------------
  it('mo lai chien dich da ket thuc dua ve DRAFT de sua ngay ban roi gui duyet lai', async () => {
    const ended = await newCampaign(CampaignStatus.ENDED);

    const res = await t.http.patch(`/api/campaigns/${ended.id}/reopen`).set(bearer(phucLong)).expect(200);
    expect(res.body.data).toMatchObject({ status: CampaignStatus.DRAFT, submittedAt: null });

    // Sua lai ngay ban roi gui duyet duoc ngay - truoc day ENDED la het duong quay lai
    const now = Date.now();
    await t.http
      .patch(`/api/campaigns/${ended.id}`)
      .set(bearer(phucLong))
      .send({
        saleStartAt: new Date(now + DAY).toISOString(),
        saleEndAt: new Date(now + 20 * DAY).toISOString(),
        voucherExpireAt: new Date(now + 40 * DAY).toISOString(),
      })
      .expect(200);
    const submitted = await t.http.patch(`/api/campaigns/${ended.id}/submit`).set(bearer(phucLong)).expect(200);
    expect(submitted.body.data.status).toBe(CampaignStatus.PENDING);
  });

  it('chi mo lai duoc chien dich da ket thuc, va chi chu that moi mo lai duoc', async () => {
    const dangBan = await newCampaign(CampaignStatus.PUBLISHED);
    await t.http.patch(`/api/campaigns/${dangBan.id}/reopen`).set(bearer(phucLong)).expect(400);

    const cuaHighlands = await newCampaign(CampaignStatus.ENDED, ID.brand);
    await t.http.patch(`/api/campaigns/${cuaHighlands.id}/reopen`).set(bearer(phucLong)).expect(403);
  });

  // ---- T14: danh gia cong khai khong bi chan thua -------------------------
  it('chu thuong hieu xem duoc danh gia cong khai cua thuong hieu khac (F06 / F15)', async () => {
    await t.http.get(`/api/brands/${ID.brand}/reviews`).set(bearer(phucLong)).expect(200);
  });

  // Chien dich cua Phuc Long (brand thu hai trong seed) tru khi chi dinh brandId khac
  async function newCampaign(status: CampaignStatus, brandId = '33333333-0000-4000-8000-000000000002') {
    const now = Date.now();
    return ds.getRepository(VoucherCampaign).save({
      brandId,
      title: `Chien dich ${status} ${crypto.randomUUID()}`,
      voucherType: VoucherType.PREPAID,
      salePrice: 40000,
      faceValue: 50000,
      totalQuantity: 10,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: 5,
      saleStartAt: new Date(now - 30 * DAY),
      saleEndAt: new Date(now - DAY),
      voucherExpireAt: new Date(now + 20 * DAY),
      status,
      submittedAt: status === CampaignStatus.PENDING ? new Date() : null,
    });
  }
});
