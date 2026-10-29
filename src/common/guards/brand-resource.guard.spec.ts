// Unit test kiem tra quyen so huu thuong hieu (F08 - T6, NFR-SEC-03).
// Chay bang: npm test
// Dung DataSource gia (khong dung DB) de kiem dung phan logic dieu huong cua guard.
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BrandResourceGuard } from './brand-resource.guard';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Role } from '../enums/role.enum';

const OWNER = 'user-chu-highlands';
const NGUOI_LA = 'user-chu-phuc-long';

interface Fixture {
  brand?: Partial<Brand> | null;
  store?: Partial<Store> | null;
  // Danh sach chi nhanh cua thuong hieu, dung cho buoc kiem storeIds khi tao chien dich
  stores?: Partial<Store>[];
  campaign?: Partial<VoucherCampaign> | null;
  assignment?: Partial<StaffAssignment> | null;
}

// Mot repository gia cho moi entity; guard chi goi findOneBy / findOne / findBy
function buildGuard(fixture: Fixture = {}) {
  const repos = new Map<unknown, unknown>([
    [
      Brand,
      {
        findOneBy: jest.fn().mockResolvedValue(
          fixture.brand === undefined ? { id: 'brand-1', ownerUserId: OWNER } : fixture.brand,
        ),
      },
    ],
    [
      Store,
      {
        findOneBy: jest.fn().mockResolvedValue(
          fixture.store === undefined ? { id: 'store-1', brandId: 'brand-1', status: true } : fixture.store,
        ),
        findBy: jest.fn().mockResolvedValue(fixture.stores ?? [{ id: 'store-1', status: true }]),
      },
    ],
    [
      VoucherCampaign,
      {
        findOneBy: jest.fn().mockResolvedValue(
          fixture.campaign === undefined ? { id: 'camp-1', brandId: 'brand-1' } : fixture.campaign,
        ),
      },
    ],
    [
      StaffAssignment,
      {
        findOne: jest.fn().mockResolvedValue(
          fixture.assignment === undefined
            ? { id: 'assign-1', store: { brandId: 'brand-1' } }
            : fixture.assignment,
        ),
      },
    ],
  ]);
  const db = { getRepository: (entity: unknown) => repos.get(entity) ?? { findOneBy: jest.fn() } } as unknown as DataSource;
  return new BrandResourceGuard(db);
}

// Gia lap ExecutionContext cua NestJS: guard chi dung getClass().name, getHandler().name va request
function contextOf(options: {
  controller: string;
  handler?: string;
  role?: Role;
  userId?: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): ExecutionContext {
  const req = {
    user: { userId: options.userId ?? OWNER, role: options.role ?? Role.BRAND_OWNER },
    params: options.params ?? {},
    body: options.body ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getClass: () => ({ name: options.controller }),
    getHandler: () => ({ name: options.handler ?? 'handler' }),
  } as unknown as ExecutionContext;
}

describe('BrandResourceGuard - quyen so huu thuong hieu (NFR-SEC-03)', () => {
  it('chu thuong hieu sua chien dich cua chinh minh thi di tiep', async () => {
    const guard = buildGuard();
    await expect(
      guard.canActivate(contextOf({ controller: 'CampaignController', params: { id: 'camp-1' } })),
    ).resolves.toBe(true);
  });

  it('chu thuong hieu khac sua chien dich thi bi tu choi - moc "Xong khi" cua T6', async () => {
    const guard = buildGuard({ brand: { id: 'brand-1', ownerUserId: NGUOI_LA } as Brand });
    await expect(
      guard.canActivate(contextOf({ controller: 'CampaignController', params: { id: 'camp-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('tao chien dich duoi ma thuong hieu nguoi khac thi bi tu choi', async () => {
    const guard = buildGuard({ brand: { id: 'brand-2', ownerUserId: NGUOI_LA } as Brand });
    await expect(
      guard.canActivate(contextOf({ controller: 'CampaignController', params: { brandId: 'brand-2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('BR-19 / DC-14: gan nhan vien sang chi nhanh cua thuong hieu khac thi bi tu choi', async () => {
    const guard = buildGuard({
      store: { id: 'store-9', brandId: 'brand-2', status: true } as Store,
      brand: { id: 'brand-2', ownerUserId: NGUOI_LA } as Brand,
    });
    await expect(
      guard.canActivate(contextOf({ controller: 'BrandController', body: { storeId: 'store-9' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FR-CAMP-03 / DC-07: storeIds khong thuoc thuong hieu thi bi tu choi', async () => {
    const guard = buildGuard({ stores: [{ id: 'store-1', status: true } as Store] });
    await expect(
      guard.canActivate(
        contextOf({
          controller: 'CampaignController',
          params: { brandId: 'brand-1' },
          body: { storeIds: ['store-1', 'store-cua-thuong-hieu-khac'] },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FR-CAMP-03: chi nhanh da vo hieu khong duoc chon lam chi nhanh ap dung', async () => {
    const guard = buildGuard({ stores: [{ id: 'store-1', status: false } as Store] });
    await expect(
      guard.canActivate(
        contextOf({
          controller: 'CampaignController',
          params: { brandId: 'brand-1' },
          body: { storeIds: ['store-1'] },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('route khong dong vao tai nguyen san co (tao thuong hieu, doc du lieu cua minh) thi cho qua', async () => {
    const guard = buildGuard();
    await expect(guard.canActivate(contextOf({ controller: 'BrandController' }))).resolves.toBe(true);
  });

  it('vai tro khac khong gan voi thuong hieu nao nen khong bi guard chan', async () => {
    const guard = buildGuard({ brand: { id: 'brand-1', ownerUserId: NGUOI_LA } as Brand });
    await expect(
      guard.canActivate(
        contextOf({ controller: 'CampaignController', role: Role.ADMIN, params: { id: 'camp-1' } }),
      ),
    ).resolves.toBe(true);
  });

  it('khong tim thay tai nguyen thi bao 404 thay vi 403', async () => {
    const guard = buildGuard({ campaign: null });
    await expect(
      guard.canActivate(contextOf({ controller: 'CampaignController', params: { id: 'khong-co' } })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Hai ca duoi la phan fail-closed cua T6: khong tra duoc thuong hieu thi tu choi, khong cho qua
  it('fail-closed: controller chua khai bao trong guard thi bi tu choi', async () => {
    const guard = buildGuard();
    await expect(
      guard.canActivate(contextOf({ controller: 'ControllerMoiChuaKhaiBao', params: { id: 'x' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fail-closed: route them tham so la ma guard chua biet tra thi bi tu choi', async () => {
    const guard = buildGuard();
    await expect(
      guard.canActivate(contextOf({ controller: 'CampaignController', params: { campaignId: 'camp-1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
