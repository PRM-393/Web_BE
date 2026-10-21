// F08 / T4: kiem thu e2e tac vu nen chuyen trang thai chien dich (FR-CAMP-10) tren PostgreSQL gia lap
// (pg-mem). Unit test chi kiem cau UPDATE sinh ra dung hay khong; file nay chay SQL that de chung minh
// cac moc "Xong khi" cua T4.
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { VoucherCampaign } from '../src/entities';
import { CampaignStatus, VoucherType } from '../src/common/enums/status.enum';
import { CampaignService } from '../src/modules/campaign/campaign.service';
import { CAMPAIGN_STATUS_JOB } from '../src/modules/campaign/campaign.scheduler';
import { ID, TestApp, createTestApp } from './helpers/test-app';

const DAY = 24 * 60 * 60 * 1000;

describe('FR-CAMP-10 - job chuyen trang thai chien dich (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let service: CampaignService;
  const now = new Date();

  // Tao chien dich thang vao CSDL de dung duoc moc thoi gian da qua (API chan ngay khong hop le - BR-21)
  async function newCampaign(overrides: Partial<VoucherCampaign>) {
    return ds.getRepository(VoucherCampaign).save({
      brandId: ID.brand,
      title: 'Chien dich kiem thu job',
      voucherType: VoucherType.PREPAID,
      salePrice: 50000,
      faceValue: 100000,
      totalQuantity: 10,
      soldQuantity: 0,
      reservedQuantity: 0,
      limitPerUser: 5,
      saleStartAt: new Date(now.getTime() - DAY),
      saleEndAt: new Date(now.getTime() + 30 * DAY),
      voucherExpireAt: new Date(now.getTime() + 90 * DAY),
      ...overrides,
    } as VoucherCampaign);
  }

  const statusOf = async (id: string) =>
    (await ds.getRepository(VoucherCampaign).findOneByOrFail({ id })).status;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.dataSource;
    service = t.app.get(CampaignService);
  }, 60000);

  afterAll(async () => {
    await t?.app.close();
  });

  it('tac vu duoc dang ky that su, chay 5 phut mot luot theo gio Viet Nam (BR-25)', () => {
    const job = t.app.get(SchedulerRegistry).getCronJob(CAMPAIGN_STATUS_JOB);
    expect(job.cronTime.source).toBe('*/5 * * * *');
    expect(job.cronTime.timeZone).toBe('Asia/Ho_Chi_Minh');
  });

  it('chien dich da duyet, toi ngay ban thi tu len PUBLISHED; chua toi ngay thi giu nguyen', async () => {
    const toiNgayBan = await newCampaign({ status: CampaignStatus.APPROVED });
    const chuaToiNgayBan = await newCampaign({
      status: CampaignStatus.APPROVED,
      saleStartAt: new Date(now.getTime() + 2 * DAY),
    });

    await service.runStatusTransitions(now);

    expect(await statusOf(toiNgayBan.id)).toBe(CampaignStatus.PUBLISHED);
    expect(await statusOf(chuaToiNgayBan.id)).toBe(CampaignStatus.APPROVED);
  });

  it('ban het ton kho kha dung thi chuyen SOLD_OUT, con giu cho cung tinh la het (DC-03)', async () => {
    const banHet = await newCampaign({ status: CampaignStatus.PUBLISHED, soldQuantity: 10 });
    const dangGiuCho = await newCampaign({
      status: CampaignStatus.PUBLISHED,
      soldQuantity: 8,
      reservedQuantity: 2,
    });
    const conHang = await newCampaign({ status: CampaignStatus.PUBLISHED, soldQuantity: 9 });

    await service.runStatusTransitions(now);

    expect(await statusOf(banHet.id)).toBe(CampaignStatus.SOLD_OUT);
    expect(await statusOf(dangGiuCho.id)).toBe(CampaignStatus.SOLD_OUT);
    expect(await statusOf(conHang.id)).toBe(CampaignStatus.PUBLISHED);
  });

  it('hoan tien cong tra hang ve thi SOLD_OUT quay lai PUBLISHED, het thoi gian ban thi khong', async () => {
    const coHangLai = await newCampaign({ status: CampaignStatus.SOLD_OUT, soldQuantity: 9 });
    const hetThoiGianBan = await newCampaign({
      status: CampaignStatus.SOLD_OUT,
      soldQuantity: 9,
      saleEndAt: new Date(now.getTime() - DAY),
    });

    await service.runStatusTransitions(now);

    expect(await statusOf(coHangLai.id)).toBe(CampaignStatus.PUBLISHED);
    // Het thoi gian ban thi phai ket thuc chu khong phai mo ban lai
    expect(await statusOf(hetThoiGianBan.id)).toBe(CampaignStatus.ENDED);
  });

  it('het thoi gian ban: PUBLISHED / PAUSED / SOLD_OUT thanh ENDED, DRAFT va PENDING giu nguyen', async () => {
    const daQuaHan = { saleEndAt: new Date(now.getTime() - DAY) };
    const dangBan = await newCampaign({ status: CampaignStatus.PUBLISHED, ...daQuaHan });
    const tamDung = await newCampaign({ status: CampaignStatus.PAUSED, ...daQuaHan });
    const hetHang = await newCampaign({ status: CampaignStatus.SOLD_OUT, soldQuantity: 10, ...daQuaHan });
    const nhap = await newCampaign({ status: CampaignStatus.DRAFT, ...daQuaHan });
    const choDuyet = await newCampaign({ status: CampaignStatus.PENDING, ...daQuaHan });
    // Da duyet ma lo mat cua so ban: van sua lai ngay roi gui duyet lai duoc (FR-CAMP-15)
    const daDuyet = await newCampaign({ status: CampaignStatus.APPROVED, ...daQuaHan });

    await service.runStatusTransitions(now);

    expect(await statusOf(dangBan.id)).toBe(CampaignStatus.ENDED);
    expect(await statusOf(tamDung.id)).toBe(CampaignStatus.ENDED);
    expect(await statusOf(hetHang.id)).toBe(CampaignStatus.ENDED);
    expect(await statusOf(nhap.id)).toBe(CampaignStatus.DRAFT);
    expect(await statusOf(choDuyet.id)).toBe(CampaignStatus.PENDING);
    expect(await statusOf(daDuyet.id)).toBe(CampaignStatus.APPROVED);
  });

  it('chien dich tam dung con thoi gian ban khong bi job mo ban lai hay danh dau het hang (FR-CAMP-08)', async () => {
    const tamDungConHang = await newCampaign({ status: CampaignStatus.PAUSED });
    const tamDungHetHang = await newCampaign({ status: CampaignStatus.PAUSED, soldQuantity: 10 });

    await service.runStatusTransitions(now);

    expect(await statusOf(tamDungConHang.id)).toBe(CampaignStatus.PAUSED);
    expect(await statusOf(tamDungHetHang.id)).toBe(CampaignStatus.PAUSED);
  });

  it('chien dich duyet xong ma da het hang thi qua PUBLISHED roi SOLD_OUT trong cung mot luot', async () => {
    const campaign = await newCampaign({ status: CampaignStatus.APPROVED, soldQuantity: 10 });

    await service.runStatusTransitions(now);

    expect(await statusOf(campaign.id)).toBe(CampaignStatus.SOLD_OUT);
  });

  it('job khong ghi de ton kho cua F09 va F12, chay lai luot nua khong doi them gi', async () => {
    const campaign = await newCampaign({
      status: CampaignStatus.APPROVED,
      soldQuantity: 4,
      reservedQuantity: 3,
    });

    await service.runStatusTransitions(now);
    const sauLuotMot = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: campaign.id });
    expect(sauLuotMot.status).toBe(CampaignStatus.PUBLISHED);
    expect(sauLuotMot.soldQuantity).toBe(4);
    expect(sauLuotMot.reservedQuantity).toBe(3);

    await service.runStatusTransitions(now);
    const sauLuotHai = await ds.getRepository(VoucherCampaign).findOneByOrFail({ id: campaign.id });
    expect(sauLuotHai).toMatchObject({
      status: CampaignStatus.PUBLISHED,
      soldQuantity: 4,
      reservedQuantity: 3,
    });
  });

  it('quan tri vien duyet chien dich da toi ngay ban thi len PUBLISHED ngay (FR-CAMP-07)', async () => {
    const admin = await t.login('admin@voucher.local');
    const campaign = await newCampaign({ status: CampaignStatus.PENDING, submittedAt: new Date() });

    const res = await t.http
      .patch(`/api/campaigns/${campaign.id}/approve`)
      .set({ Authorization: `Bearer ${admin}` })
      .expect(200);

    expect(res.body.data.status).toBe(CampaignStatus.PUBLISHED);
    expect(res.body.data.approvedBy).toBeTruthy();
    expect(await statusOf(campaign.id)).toBe(CampaignStatus.PUBLISHED);
  });
});
