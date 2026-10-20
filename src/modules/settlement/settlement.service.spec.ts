// Unit test cau hinh ty le hoa hong (F13 - T3).
// Chay bang: npm test
// Dung repository gia (khong dung DB) de kiem dung phan logic trong service.
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  COMMISSION_RATE_KEY,
  DEFAULT_COMMISSION_RATE,
  SettlementService,
  validateCommissionRate,
} from './settlement.service';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Brand } from '../../entities/brand.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { OrderStatus, VoucherItemStatus } from '../../common/enums/status.enum';

// storedConfig = ban ghi system_configs dang co; truyen null de gia lap "chua ai cau hinh"
function buildService(storedConfig: Partial<SystemConfig> | null, voucherItems: any[] = []) {
  const configRepo = {
    findOne: jest.fn().mockResolvedValue(storedConfig),
    save: jest.fn((entity) => Promise.resolve(entity)),
  } as unknown as Repository<SystemConfig>;

  const auditLogRepo = {
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => Promise.resolve(entity)),
  } as unknown as Repository<AuditLog>;

  const settlementRepo = {
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => Promise.resolve({ id: 'settle-1', ...entity })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as Repository<Settlement>;

  const settlementItemRepo = {
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<SettlementItem>;

  const brandRepo = {
    find: jest.fn().mockResolvedValue([{ id: 'brand-1', name: 'Tra sua ABC' }]),
  } as unknown as Repository<Brand>;

  // Query builder gia: moi buoc .where/.andWhere tra lai chinh no, .getMany() tra danh sach dung san
  const queryBuilder: any = {
    innerJoinAndSelect: () => queryBuilder,
    innerJoin: () => queryBuilder,
    leftJoin: () => queryBuilder,
    where: () => queryBuilder,
    andWhere: () => queryBuilder,
    getMany: jest.fn().mockResolvedValue(voucherItems),
  };
  const voucherItemRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  } as unknown as Repository<VoucherItem>;

  const service = new SettlementService(
    settlementRepo,
    settlementItemRepo,
    configRepo,
    brandRepo,
    voucherItemRepo,
    auditLogRepo,
  );
  return { service, configRepo, auditLogRepo, settlementRepo, settlementItemRepo };
}

describe('FR-SETTLE-01 / BR-09 - khoang hop le cua ty le hoa hong', () => {
  it('nhan ty le nam giua 0 va 1', () => {
    expect(validateCommissionRate(0.1)).toBe(0.1);
    expect(validateCommissionRate(0.075)).toBe(0.075);
    expect(validateCommissionRate(0.99)).toBe(0.99);
  });

  it('tu choi ty le bang 0 (san khong thu duoc gi)', () => {
    expect(() => validateCommissionRate(0)).toThrow(BadRequestException);
  });

  it('tu choi ty le bang 1 (thuong hieu khong nhan duoc gi)', () => {
    expect(() => validateCommissionRate(1)).toThrow(BadRequestException);
  });

  it('tu choi ty le am va ty le lon hon 1', () => {
    expect(() => validateCommissionRate(-0.1)).toThrow(BadRequestException);
    expect(() => validateCommissionRate(1.5)).toThrow(BadRequestException);
  });

  it('tu choi gia tri khong phai so', () => {
    expect(() => validateCommissionRate(Number.NaN)).toThrow(BadRequestException);
    expect(() => validateCommissionRate('muoi phan tram')).toThrow(BadRequestException);
    expect(() => validateCommissionRate(null)).toThrow(BadRequestException);
    expect(() => validateCommissionRate(undefined)).toThrow(BadRequestException);
  });

  it('bao loi bang tieng Viet, neu ro khoang hop le va vi du nhap', () => {
    expect(() => validateCommissionRate(0)).toThrow(/lon hon 0 va nho hon 1/);
    expect(() => validateCommissionRate(0)).toThrow(/Vi du nhap 0.1/);
  });
});

describe('FR-SETTLE-01 - luu ty le hoa hong', () => {
  it('luu vao SystemConfig dung khoa commission_rate ma F09 doc', async () => {
    const { service, configRepo } = buildService({ key: COMMISSION_RATE_KEY, value: '0.1' });
    const result = await service.setCommissionRate({ rate: 0.15 }, 'admin-1');

    expect(configRepo.save).toHaveBeenCalledWith({
      key: COMMISSION_RATE_KEY,
      value: '0.15',
      updatedBy: 'admin-1',
    });
    expect(result.rate).toBe(0.15);
  });

  it('khong luu khi ty le ngoai khoang hop le', async () => {
    const { service, configRepo } = buildService({ key: COMMISSION_RATE_KEY, value: '0.1' });
    await expect(service.setCommissionRate({ rate: 1 }, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(configRepo.save).not.toHaveBeenCalled();
  });

  // NFR-SEC-07
  it('ghi nhat ky kiem toan kem nguoi thuc hien, gia tri cu va gia tri moi', async () => {
    const { service, auditLogRepo } = buildService({ key: COMMISSION_RATE_KEY, value: '0.1' });
    await service.setCommissionRate({ rate: 0.2 }, 'admin-1');

    expect(auditLogRepo.save).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SET_COMMISSION_RATE',
        entityType: 'SystemConfig',
        entityId: COMMISSION_RATE_KEY,
        detail: { previousRate: 0.1, newRate: 0.2 },
      }),
    );
  });
});

describe('FR-SETTLE-01 - doc ty le hoa hong', () => {
  it('tra ty le da cau hinh', async () => {
    const { service } = buildService({ key: COMMISSION_RATE_KEY, value: '0.12' });
    await expect(service.getCommissionRate()).resolves.toBe(0.12);
  });

  it('chua cau hinh thi dung ty le mac dinh', async () => {
    const { service } = buildService(null);
    await expect(service.getCommissionRate()).resolves.toBe(DEFAULT_COMMISSION_RATE);
  });

  // Mot ban ghi hong khong duoc bien hoa hong thanh NaN roi lan vao phieu doi soat
  it('ban ghi hong hoac ngoai khoang thi lui ve ty le mac dinh', async () => {
    for (const value of ['abc', '', '0', '1', '-0.2', '3']) {
      const { service } = buildService({ key: COMMISSION_RATE_KEY, value });
      await expect(service.getCommissionRate()).resolves.toBe(DEFAULT_COMMISSION_RATE);
    }
  });

  it('kem nguoi sua va thoi diem sua gan nhat', async () => {
    const updatedAt = new Date('2026-10-20T03:00:00.000Z');
    const { service } = buildService({ key: COMMISSION_RATE_KEY, value: '0.18', updatedBy: 'admin-1', updatedAt });
    await expect(service.getCommissionRateInfo()).resolves.toEqual({
      rate: 0.18,
      isDefault: false,
      updatedBy: 'admin-1',
      updatedAt,
    });
  });

  it('danh dau isDefault khi chua ai cau hinh', async () => {
    const { service } = buildService(null);
    const info = await service.getCommissionRateInfo();
    expect(info).toEqual({ rate: DEFAULT_COMMISSION_RATE, isDefault: true, updatedBy: null, updatedAt: null });
  });
});

describe('BR-09 - doi soat dung ty le da chot vao don, khong dung ty le hien hanh', () => {
  // Hai don cua cung thuong hieu: mot don chot 10% truoc khi doi ty le, mot don chot 20% sau khi doi.
  // Ty le hien hanh luc chay doi soat la 50% - neu service lay nham ty le hien hanh thi so se lech.
  const voucherItems = [
    {
      id: 'v-1',
      orderId: 'o-1',
      status: VoucherItemStatus.USED,
      order: { id: 'o-1', unitPrice: 100000, commissionRate: 0.1, status: OrderStatus.FULFILLED },
    },
    {
      id: 'v-2',
      orderId: 'o-2',
      status: VoucherItemStatus.ACTIVE,
      order: { id: 'o-2', unitPrice: 200000, commissionRate: 0.2, status: OrderStatus.FULFILLED },
    },
  ];

  it('tinh hoa hong theo Order.commissionRate cua tung don', async () => {
    const { service, settlementRepo, settlementItemRepo } = buildService(
      { key: COMMISSION_RATE_KEY, value: '0.5' },
      voucherItems,
    );

    await service.runMonthlySettlement(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-30T23:59:59.000Z'));

    // 100000 * 0.1 + 200000 * 0.2 = 50000, khong phai 300000 * 0.5 = 150000
    expect(settlementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        voucherCount: 2,
        grossRevenue: 300000,
        commissionAmount: 50000,
        payableAmount: 250000,
      }),
    );
    expect(settlementItemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ voucherItemId: 'v-1', commissionRate: 0.1, commissionAmount: 10000 }),
    );
    expect(settlementItemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ voucherItemId: 'v-2', commissionRate: 0.2, commissionAmount: 40000 }),
    );
  });

  it('don cu chua chot ty le thi lay ty le hien hanh lam phuong an du phong', async () => {
    const { service, settlementItemRepo } = buildService({ key: COMMISSION_RATE_KEY, value: '0.3' }, [
      {
        id: 'v-3',
        orderId: 'o-3',
        status: VoucherItemStatus.USED,
        order: { id: 'o-3', unitPrice: 100000, commissionRate: null, status: OrderStatus.FULFILLED },
      },
    ]);

    await service.runMonthlySettlement(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-30T23:59:59.000Z'));

    expect(settlementItemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ voucherItemId: 'v-3', commissionRate: 0.3, commissionAmount: 30000 }),
    );
  });
});
