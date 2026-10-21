// Unit test rang buoc nghiep vu cua chien dich (F08 - T2).
// Chay bang: npm test
// Dung repository gia (khong dung DB) de kiem dung phan logic trong service.
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  CampaignService,
  MIN_EXPIRE_DAYS_AFTER_SALE_END,
  validateTimeline,
  validateValueFields,
} from './campaign.service';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { Brand } from '../../entities/brand.entity';
import { BrandStatus, CampaignStatus, DiscountType, VoucherType } from '../../common/enums/status.enum';

const DAY_MS = 24 * 60 * 60 * 1000;
// Moc tuong doi so voi luc chay test, de test khong het han theo thoi gian
const day = (n: number) => new Date(Date.now() + n * DAY_MS);

function campaignOf(overrides: Partial<VoucherCampaign> = {}): VoucherCampaign {
  return {
    id: 'camp-1',
    brandId: 'brand-1',
    title: 'Giam 20% tra sua',
    voucherType: VoucherType.DISCOUNT,
    discountType: DiscountType.PERCENT,
    discountValue: 20,
    maxDiscount: 15000,
    comboItems: null,
    salePrice: 10000,
    faceValue: 50000,
    totalQuantity: 100,
    soldQuantity: 0,
    reservedQuantity: 0,
    limitPerUser: 5,
    saleStartAt: day(-1),
    saleEndAt: day(30),
    voucherExpireAt: day(60),
    status: CampaignStatus.DRAFT,
    submittedAt: null,
    ...overrides,
  } as VoucherCampaign;
}

// T4: job chuyen trang thai sinh cau UPDATE ... WHERE. O unit test chi ghi lai cau lenh sinh ra
// (dung from/to, chi ghi cot status, dung dieu kien); hanh vi that tren SQL duoc phu o
// test/campaign-job.e2e-spec.ts bang PostgreSQL gia lap.
interface RecordedUpdate {
  from: CampaignStatus[];
  to: CampaignStatus;
  set: Record<string, unknown>;
  where: string[];
  params: Record<string, unknown>;
}

function recordingQueryBuilder(log: RecordedUpdate[]) {
  const entry: RecordedUpdate = { from: [], to: CampaignStatus.DRAFT, set: {}, where: [], params: {} };
  const collect = (clause: string, params?: Record<string, unknown>) => {
    entry.where.push(clause);
    Object.assign(entry.params, params ?? {});
    if (params?.from) entry.from = params.from as CampaignStatus[];
  };
  const qb = {
    update: () => qb,
    set: (values: Record<string, unknown>) => {
      entry.set = values;
      entry.to = values.status as CampaignStatus;
      return qb;
    },
    where: (clause: string, params?: Record<string, unknown>) => (collect(clause, params), qb),
    andWhere: (clause: string, params?: Record<string, unknown>) => (collect(clause, params), qb),
    setParameter: (key: string, value: unknown) => {
      entry.params[key] = value;
      return qb;
    },
    // affected khac nhau tung buoc de kiem duoc service gan dung so vao dung ten
    execute: async () => {
      log.push(entry);
      return { affected: log.length };
    },
  };
  return qb;
}

function buildService(campaign: VoucherCampaign | null, brand?: Partial<Brand> | null) {
  const updates: RecordedUpdate[] = [];
  const campaignRepo = {
    findOne: jest.fn().mockResolvedValue(campaign),
    save: jest.fn((entity) => Promise.resolve(entity)),
    create: jest.fn((entity) => entity),
    find: jest.fn().mockResolvedValue([]),
    // PostgreSQL boc ten cot bang dau nhay kep, MySQL bang dau huyen - o test dung kieu PostgreSQL
    manager: { connection: { driver: { escape: (name: string) => `"${name}"` } } },
    createQueryBuilder: jest.fn(() => recordingQueryBuilder(updates)),
  } as unknown as Repository<VoucherCampaign>;

  const campaignStoreRepo = {
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => Promise.resolve(entity)),
  } as unknown as Repository<CampaignStore>;

  const brandRepo = {
    findOne: jest.fn().mockResolvedValue(brand === undefined ? { id: 'brand-1', status: BrandStatus.APPROVED } : brand),
  } as unknown as Repository<Brand>;

  return { service: new CampaignService(campaignRepo, campaignStoreRepo, brandRepo), campaignRepo, brandRepo, updates };
}

describe('BR-21 / DC-10 / FR-CAMP-13 - rang buoc moc thoi gian', () => {
  it('tu choi khi ngay ket thuc ban khong sau ngay bat dau ban', () => {
    expect(() =>
      validateTimeline({ saleStartAt: day(10), saleEndAt: day(5), voucherExpireAt: day(90) }),
    ).toThrow(BadRequestException);
  });

  it('tu choi khi han su dung chi cach ngay ket thuc ban 9 ngay', () => {
    const saleEndAt = day(30);
    expect(() =>
      validateTimeline({
        saleStartAt: day(1),
        saleEndAt,
        voucherExpireAt: new Date(saleEndAt.getTime() + 9 * DAY_MS),
      }),
    ).toThrow(BadRequestException);
  });

  it('chap nhan ca bien: han su dung dung bang ngay ket thuc ban cong 10 ngay', () => {
    const saleEndAt = day(30);
    expect(() =>
      validateTimeline({
        saleStartAt: day(1),
        saleEndAt,
        voucherExpireAt: new Date(saleEndAt.getTime() + MIN_EXPIRE_DAYS_AFTER_SALE_END * DAY_MS),
      }),
    ).not.toThrow();
  });

  it('kiem duoc ca khi ngay den duoi dang chuoi ISO tu DTO', () => {
    expect(() =>
      validateTimeline({
        saleStartAt: '2026-11-01T00:00:00.000Z',
        saleEndAt: '2026-11-30T00:00:00.000Z',
        voucherExpireAt: '2026-12-05T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('tu choi khi thieu moc thoi gian', () => {
    expect(() => validateTimeline({ saleStartAt: day(1), saleEndAt: day(30) })).toThrow(BadRequestException);
  });
});

describe('FR-CAMP-12 - truong gia tri theo loai voucher', () => {
  it('giam theo phan tram ma thieu muc giam toi da thi bi tu choi', () => {
    expect(() =>
      validateValueFields({
        voucherType: VoucherType.DISCOUNT,
        discountType: DiscountType.PERCENT,
        discountValue: 30,
        salePrice: 10000,
        faceValue: 50000,
      }),
    ).toThrow(BadRequestException);
  });

  // Cot tien la bigint nen TypeORM tra ve chuoi: so sanh phai bo Number() moi dung
  it('voucher menh gia co faceValue khong lon hon gia ban thi bi tu choi, ke ca khi gia tri la chuoi', () => {
    expect(() =>
      validateValueFields({ voucherType: VoucherType.PREPAID, salePrice: '80000', faceValue: '80000' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateValueFields({ voucherType: VoucherType.PREPAID, salePrice: '80000', faceValue: '100000' }),
    ).not.toThrow();
  });

  it('combo thieu mo ta noi dung goi thi bi tu choi', () => {
    expect(() =>
      validateValueFields({ voucherType: VoucherType.COMBO, salePrice: 45000, faceValue: 59000 }),
    ).toThrow(BadRequestException);
  });
});

describe('FR-CAMP-14 - khoa sua khi dang cho duyet va rut ve nhap', () => {
  it('khong sua duoc chien dich dang cho duyet', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.PENDING }));
    await expect(service.update('camp-1', { title: 'Ten moi' })).rejects.toThrow(BadRequestException);
  });

  it('rut chien dich dang cho duyet ve nhap va xoa moc gui duyet', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.PENDING, submittedAt: day(-1) }));
    const result = await service.withdraw('camp-1');
    expect(result.status).toBe(CampaignStatus.DRAFT);
    expect(result.submittedAt).toBeNull();
  });

  it('khong rut duoc chien dich dang o trang thai nhap', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.DRAFT }));
    await expect(service.withdraw('camp-1')).rejects.toThrow(BadRequestException);
  });

  it('chi gui duyet duoc tu trang thai nhap', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.PUBLISHED }));
    await expect(service.submitForApproval('camp-1')).rejects.toThrow(BadRequestException);
  });
});

describe('FR-CAMP-15 - sua chien dich da duyet thi phai duyet lai', () => {
  it.each([
    CampaignStatus.APPROVED,
    CampaignStatus.PUBLISHED,
    CampaignStatus.SOLD_OUT,
    CampaignStatus.PAUSED,
  ])('sua chien dich %s dua ve PENDING', async (status) => {
    const { service } = buildService(campaignOf({ status }));
    const result = await service.update('camp-1', { title: 'Ten moi' });
    expect(result.status).toBe(CampaignStatus.PENDING);
    expect(result.submittedAt).toBeInstanceOf(Date);
  });

  it('sua chien dich nhap thi van o nhap', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.DRAFT }));
    const result = await service.update('camp-1', { title: 'Ten moi' });
    expect(result.status).toBe(CampaignStatus.DRAFT);
  });

  it('sua moc thoi gian sai rang buoc van bi chan', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.DRAFT }));
    await expect(
      service.update('camp-1', { voucherExpireAt: new Date(day(30).getTime() + DAY_MS).toISOString() }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BR-17 - khoa truong gia tri khi da ban duoc voucher', () => {
  const daBan = () => campaignOf({ status: CampaignStatus.PUBLISHED, soldQuantity: 5 });

  it.each(['salePrice', 'faceValue', 'voucherExpireAt', 'voucherType', 'discountType', 'discountValue'])(
    'tu choi sua truong %s',
    async (field) => {
      const { service } = buildService(daBan());
      const dto: Record<string, unknown> = {
        salePrice: 20000,
        faceValue: 60000,
        voucherExpireAt: day(90).toISOString(),
        voucherType: VoucherType.PREPAID,
        discountType: DiscountType.AMOUNT,
        discountValue: 5000,
      };
      await expect(service.update('camp-1', { [field]: dto[field] } as never)).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('van cho sua tieu de va mo ta, va dua chien dich ve cho duyet lai', async () => {
    const { service } = buildService(daBan());
    const result = await service.update('camp-1', { title: 'Ten moi', description: 'Mo ta moi' });
    expect(result.title).toBe('Ten moi');
    expect(result.status).toBe(CampaignStatus.PENDING);
  });
});

describe('BR-26 - thuong hieu chua duyet hoac bi dinh chi khong duoc gui duyet', () => {
  it.each([BrandStatus.PENDING, BrandStatus.REJECTED, BrandStatus.SUSPENDED])(
    'tu choi khi thuong hieu o trang thai %s',
    async (status) => {
      const { service } = buildService(campaignOf(), { id: 'brand-1', status });
      await expect(service.submitForApproval('camp-1')).rejects.toThrow(BadRequestException);
    },
  );

  it('cho gui duyet khi thuong hieu da duoc duyet', async () => {
    const { service } = buildService(campaignOf(), { id: 'brand-1', status: BrandStatus.APPROVED });
    const result = await service.submitForApproval('camp-1');
    expect(result.status).toBe(CampaignStatus.PENDING);
    expect(result.submittedAt).toBeInstanceOf(Date);
  });
});

describe('UC-04 - duyet chien dich', () => {
  it('chi duyet duoc chien dich dang cho duyet', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.DRAFT }));
    await expect(service.approve('camp-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  // Luong 3b: vi pham rang buoc ngay thi khong cho duyet
  it('khong duyet duoc chien dich vi pham rang buoc ngay', async () => {
    const saleEndAt = day(30);
    const { service } = buildService(
      campaignOf({
        status: CampaignStatus.PENDING,
        saleEndAt,
        voucherExpireAt: new Date(saleEndAt.getTime() + DAY_MS),
      }),
    );
    await expect(service.approve('camp-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('duyet thanh cong chien dich hop le va ghi lai nguoi duyet', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.PENDING }));
    const result = await service.approve('camp-1', 'admin-1');
    expect(result.status).toBe(CampaignStatus.APPROVED);
    expect(result.approvedBy).toBe('admin-1');
    expect(result.approvedAt).toBeInstanceOf(Date);
  });
});

describe('FR-CAMP-08 - tam dung va mo lai', () => {
  it('chi mo lai duoc chien dich dang tam dung, khong mo tu nhap (NFR-SEC-03)', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.DRAFT }));
    await expect(service.resume('camp-1')).rejects.toThrow(BadRequestException);
  });

  it('mo lai chien dich dang tam dung', async () => {
    const { service } = buildService(campaignOf({ status: CampaignStatus.PAUSED }));
    const result = await service.resume('camp-1');
    expect(result.status).toBe(CampaignStatus.PUBLISHED);
  });
});

// T4 - FR-CAMP-10: tac vu nen 5 phut mot luot chuyen trang thai chien dich
describe('FR-CAMP-10 - tac vu nen chuyen trang thai chien dich', () => {
  const S = CampaignStatus;
  const runAt = new Date('2026-10-21T03:00:00.000Z');

  async function runJob() {
    const { service, updates } = buildService(campaignOf({ status: S.APPROVED }));
    const result = await service.runStatusTransitions(runAt);
    return { updates, result };
  }

  const clauses = (update: RecordedUpdate) => update.where.join(' ');

  it('mot luot gom dung 4 buoc, theo dung thu tu cua FR-CAMP-10', async () => {
    const { updates } = await runJob();
    expect(updates.map((u) => [u.from, u.to])).toEqual([
      [[S.APPROVED], S.PUBLISHED],
      [[S.PUBLISHED], S.SOLD_OUT],
      [[S.SOLD_OUT], S.PUBLISHED],
      [[S.PUBLISHED, S.PAUSED, S.SOLD_OUT], S.ENDED],
    ]);
  });

  it('chi ghi cot status, khong dung vao soldQuantity / reservedQuantity cua F09 va F12', async () => {
    const { updates } = await runJob();
    for (const update of updates) {
      expect(Object.keys(update.set)).toEqual(['status']);
    }
  });

  it('phat hanh khi da toi ngay bat dau ban va van con thoi gian ban (FR-CAMP-07, BR-08)', async () => {
    const { updates } = await runJob();
    expect(clauses(updates[0])).toContain('"saleStartAt" <= :now');
    expect(clauses(updates[0])).toContain('"saleEndAt" > :now');
    expect(updates[0].params.now).toBe(runAt);
  });

  it('het hang va co hang lai xet theo ton kho kha dung total - sold - reserved (DC-03)', async () => {
    const { updates } = await runJob();
    const available = '"totalQuantity" - "soldQuantity" - "reservedQuantity"';
    expect(clauses(updates[1])).toContain(`${available} <= 0`);
    expect(clauses(updates[2])).toContain(`${available} > 0`);
    // Het thoi gian ban thi phai ket thuc chu khong phai danh dau het hang
    expect(clauses(updates[1])).toContain('"saleEndAt" > :now');
    expect(clauses(updates[2])).toContain('"saleEndAt" > :now');
  });

  it('chien dich tam dung chi bi dong vao khi het thoi gian ban (FR-CAMP-08)', async () => {
    const { updates } = await runJob();
    const touchingPaused = updates.filter((u) => u.from.includes(S.PAUSED));
    expect(touchingPaused.map((u) => u.to)).toEqual([S.ENDED]);
  });

  it('ket thuc ban khong dong vao chien dich chua phat hanh', async () => {
    const { updates } = await runJob();
    const ending = updates[3];
    expect(ending.from).not.toContain(S.DRAFT);
    expect(ending.from).not.toContain(S.PENDING);
    // APPROVED lo mat cua so ban van sua lai duoc (FR-CAMP-15), ENDED thi het duong quay lai
    expect(ending.from).not.toContain(S.APPROVED);
    expect(clauses(ending)).toContain('"saleEndAt" <= :now');
  });

  it('chay theo luot thi ra soat toan bo chien dich, khong gioi han theo id', async () => {
    const { updates } = await runJob();
    for (const update of updates) {
      expect(update.params.campaignId).toBeUndefined();
    }
  });

  it('tra ve so chien dich da doi o tung buoc de ghi nhat ky', async () => {
    const { result } = await runJob();
    expect(result).toEqual({ published: 1, soldOut: 2, restocked: 3, ended: 4 });
  });

  it('duyet xong thi ra soat ngay chien dich vua duyet, khong doi het luot 5 phut (FR-CAMP-07)', async () => {
    const { service, updates } = buildService(campaignOf({ status: S.PENDING, saleStartAt: day(-1) }));
    await service.approve('camp-1', 'admin-1');
    expect(updates).toHaveLength(4);
    for (const update of updates) {
      expect(update.params.campaignId).toBe('camp-1');
    }
  });
});
