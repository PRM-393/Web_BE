// Unit test rang buoc chi nhanh va nhan vien (F07 - T5).
// Chay bang: npm test
// Dung repository gia (khong dung DB) de kiem dung phan logic trong service.
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { BrandService, assertStoreCoordinates } from './brand.service';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { User } from '../../entities/user.entity';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Role } from '../../common/enums/role.enum';
import { UserStatus, VoucherItemStatus } from '../../common/enums/status.enum';

function storeOf(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    brandId: 'brand-1',
    name: 'Q1 Le Loi',
    address: '1 Le Loi',
    latitude: 10.7769,
    longitude: 106.7009,
    status: true,
    ...overrides,
  } as Store;
}

interface Fixture {
  store?: Store | null;
  // Chien dich ap dung tai cac chi nhanh (dung chung cho ca hai lan doc campaign_stores cua BR-24)
  links?: Partial<CampaignStore>[];
  vouchers?: Partial<VoucherItem>[];
  campaigns?: Partial<VoucherCampaign>[];
  staff?: Partial<StaffAssignment>[];
  user?: Partial<User> | null;
}

function buildService(fixture: Fixture = {}) {
  const saved: Record<string, unknown[]> = { store: [], staff: [], user: [] };

  const storeRepo = {
    findOne: jest.fn().mockResolvedValue(fixture.store === undefined ? storeOf() : fixture.store),
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => (saved.store.push(entity), Promise.resolve(entity))),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<Store>;

  const campaignStoreRepo = {
    find: jest.fn().mockResolvedValue(fixture.links ?? []),
  } as unknown as Repository<CampaignStore>;

  const voucherItemRepo = {
    find: jest.fn().mockResolvedValue(fixture.vouchers ?? []),
  } as unknown as Repository<VoucherItem>;

  const campaignRepo = {
    find: jest.fn().mockResolvedValue(fixture.campaigns ?? [{ title: 'Combo trua' }]),
  } as unknown as Repository<VoucherCampaign>;

  const staffRepo = {
    find: jest.fn().mockResolvedValue(fixture.staff ?? []),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((entity) => entity),
    save: jest.fn((entity) => (saved.staff.push(entity), Promise.resolve(entity))),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<StaffAssignment>;

  const userRepo = {
    findOne: jest.fn().mockResolvedValue(fixture.user === undefined ? null : fixture.user),
    create: jest.fn((entity) => ({ id: 'user-1', ...entity })),
    save: jest.fn((entity) => (saved.user.push(entity), Promise.resolve(entity))),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<User>;

  const sessionRepo = { update: jest.fn().mockResolvedValue({ affected: 2 }) } as unknown as Repository<RefreshToken>;
  const brandRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  } as unknown as Repository<Brand>;
  const authService = { sendActivation: jest.fn().mockResolvedValue({}) } as unknown as AuthService;

  const service = new BrandService(
    brandRepo,
    storeRepo,
    staffRepo,
    userRepo,
    sessionRepo,
    campaignStoreRepo,
    campaignRepo,
    voucherItemRepo,
    authService,
  );
  return { service, storeRepo, staffRepo, userRepo, sessionRepo, voucherItemRepo, authService, saved };
}

describe('DC-05 - chi nhanh dang hoat dong bat buoc co toa do', () => {
  it('thieu vi do hoac kinh do thi tu choi', () => {
    expect(() => assertStoreCoordinates({ status: true, latitude: 10.7, longitude: null })).toThrow(
      BadRequestException,
    );
    expect(() => assertStoreCoordinates({ status: true, latitude: null, longitude: 106.7 })).toThrow(
      BadRequestException,
    );
  });

  it('chi nhanh da vo hieu thi khong bat buoc toa do', () => {
    expect(() => assertStoreCoordinates({ status: false, latitude: null, longitude: null })).not.toThrow();
  });

  it('toa do bang 0 van hop le - khong duoc coi so 0 la rong', () => {
    expect(() => assertStoreCoordinates({ status: true, latitude: 0, longitude: 0 })).not.toThrow();
  });

  it('sua chi nhanh ma xoa toa do thi bi tu choi', async () => {
    const { service } = buildService();
    await expect(service.updateStore('store-1', { latitude: null as unknown as number })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('mo lai chi nhanh da vo hieu ma khong co toa do thi bi tu choi', async () => {
    const { service } = buildService({
      store: storeOf({ status: false, latitude: null as unknown as number, longitude: null as unknown as number }),
    });
    await expect(service.updateStore('store-1', { status: true })).rejects.toThrow(BadRequestException);
  });

  it('mo lai chi nhanh kem toa do thi luu duoc', async () => {
    const { service, saved } = buildService({
      store: storeOf({ status: false, latitude: null as unknown as number, longitude: null as unknown as number }),
    });
    await service.updateStore('store-1', { status: true, latitude: 21.0278, longitude: 105.8342 });
    expect(saved.store[0]).toMatchObject({ status: true, latitude: 21.0278, longitude: 105.8342 });
  });

  it('khong tim thay chi nhanh thi bao 404 chu khong phai loi he thong', async () => {
    const { service } = buildService({ store: null });
    await expect(service.updateStore('khong-co', { name: 'X' })).rejects.toThrow(NotFoundException);
  });
});

describe('BR-24 / FR-BRAND-08 - khong vo hieu chi nhanh ap dung cuoi cung', () => {
  const linkToStore1 = [{ campaignId: 'camp-1', storeId: 'store-1' }];
  const blocking: Fixture = {
    links: linkToStore1,
    vouchers: [{ campaignId: 'camp-1' }],
    campaigns: [{ title: 'Combo trua' } as VoucherCampaign],
  };

  it('chan khi la chi nhanh cuoi cung cua chien dich con voucher dung duoc', async () => {
    const { service, storeRepo } = buildService(blocking);
    await expect(service.deactivateStore('store-1')).rejects.toThrow(BadRequestException);
    expect(storeRepo.update).not.toHaveBeenCalled();
  });

  it('thong bao neu ro ten chien dich va viec can lam tiep', async () => {
    const { service } = buildService(blocking);
    await expect(service.deactivateStore('store-1')).rejects.toThrow(/Combo trua[\s\S]*chi nhánh áp dụng khác/);
  });

  it('cho vo hieu khi chien dich con chi nhanh ap dung khac dang hoat dong', async () => {
    const { service, storeRepo } = buildService({
      links: [
        ...linkToStore1,
        { campaignId: 'camp-1', storeId: 'store-2', store: storeOf({ id: 'store-2', status: true }) },
      ],
      vouchers: [{ campaignId: 'camp-1' }],
    });
    await service.deactivateStore('store-1');
    expect(storeRepo.update).toHaveBeenCalledWith('store-1', { status: false });
  });

  it('chi nhanh ap dung khac da vo hieu thi khong tinh la con cho dung', async () => {
    const { service } = buildService({
      links: [
        ...linkToStore1,
        { campaignId: 'camp-1', storeId: 'store-2', store: storeOf({ id: 'store-2', status: false }) },
      ],
      vouchers: [{ campaignId: 'camp-1' }],
      campaigns: [{ title: 'Combo trua' } as VoucherCampaign],
    });
    await expect(service.deactivateStore('store-1')).rejects.toThrow(BadRequestException);
  });

  it('khong con voucher dung duoc thi vo hieu binh thuong', async () => {
    const { service, storeRepo } = buildService({ links: linkToStore1, vouchers: [] });
    await service.deactivateStore('store-1');
    expect(storeRepo.update).toHaveBeenCalledWith('store-1', { status: false });
  });

  it('chi nhanh khong thuoc chien dich nao thi vo hieu ngay, khong truy van them', async () => {
    const { service, voucherItemRepo, storeRepo } = buildService({ links: [] });
    await service.deactivateStore('store-1');
    expect(voucherItemRepo.find).not.toHaveBeenCalled();
    expect(storeRepo.update).toHaveBeenCalled();
  });

  it('chi xet voucher ACTIVE va chua qua han, dung nguyen van BR-24', async () => {
    const { service, voucherItemRepo } = buildService({ links: linkToStore1, vouchers: [] });
    await service.deactivateStore('store-1');
    const where = (voucherItemRepo.find as jest.Mock).mock.calls[0][0].where;
    expect(where.status).toBe(VoucherItemStatus.ACTIVE);
    expect(where.expireAt._value).toBeInstanceOf(Date);
  });

  it('vo hieu lai chi nhanh da vo hieu thi khong can kiem BR-24', async () => {
    const { service, voucherItemRepo } = buildService({ store: storeOf({ status: false }), links: linkToStore1 });
    await service.deactivateStore('store-1');
    expect(voucherItemRepo.find).not.toHaveBeenCalled();
  });

  it('sua chi nhanh voi status = false cung phai qua cua BR-24', async () => {
    const { service } = buildService(blocking);
    await expect(service.updateStore('store-1', { status: false })).rejects.toThrow(BadRequestException);
  });
});

describe('FR-BRAND-05 / BR-19 - gan nhan vien vao chi nhanh', () => {
  const staffUser = { id: 'user-1', email: 'nv@highlands.vn', role: Role.STORE_STAFF, status: UserStatus.ACTIVE };

  it('nhan vien dang lam cho thuong hieu khac thi khong gan duoc', async () => {
    const { service } = buildService({
      user: staffUser,
      staff: [{ storeId: 'store-9', store: storeOf({ id: 'store-9', brandId: 'brand-khac' }) }],
    });
    await expect(service.assignStaff({ email: staffUser.email, storeId: 'store-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('gan trung chi nhanh dang hoat dong thi bao loi, khong tao dong moi', async () => {
    const { service, saved } = buildService({
      user: staffUser,
      staff: [{ storeId: 'store-1', active: true, store: storeOf() }],
    });
    await expect(service.assignStaff({ email: staffUser.email, storeId: 'store-1' })).rejects.toThrow(
      BadRequestException,
    );
    expect(saved.staff).toHaveLength(0);
  });

  it('gan them chi nhanh thu hai cua cung thuong hieu thi duoc', async () => {
    const { service, saved } = buildService({
      user: staffUser,
      staff: [{ storeId: 'store-1', active: true, store: storeOf() }],
    });
    await service.assignStaff({ email: staffUser.email, storeId: 'store-2' });
    expect(saved.staff[0]).toMatchObject({ userId: 'user-1', storeId: 'store-2', active: true });
  });

  it('nhan lai nguoi da nghi: mo lai dong cu va gui lai lien ket kich hoat', async () => {
    const { service, userRepo, authService, saved } = buildService({
      user: { ...staffUser, status: UserStatus.INACTIVE },
      staff: [{ id: 'a1', storeId: 'store-1', active: false, store: storeOf() }],
    });
    await service.assignStaff({ email: staffUser.email, storeId: 'store-1' });

    expect(saved.staff[0]).toMatchObject({ id: 'a1', active: true });
    expect(userRepo.update).toHaveBeenCalledWith('user-1', { status: UserStatus.PENDING_ACTIVATION });
    expect(authService.sendActivation).toHaveBeenCalledWith(staffUser.email);
  });

  it('chi nhanh khong ton tai thi bao 404', async () => {
    const { service } = buildService({ store: null, user: staffUser });
    await expect(service.assignStaff({ email: staffUser.email, storeId: 'khong-co' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('FR-BRAND-06 / FR-AUTH-10 - vo hieu hoa nhan vien', () => {
  it('vo hieu tai khoan va thu hoi moi phien dang con hieu luc', async () => {
    const { service, staffRepo, userRepo, sessionRepo } = buildService();
    (staffRepo.findOne as jest.Mock).mockResolvedValue({ id: 'a1', userId: 'user-1' });

    await service.deactivateStaff('a1');

    expect(staffRepo.update).toHaveBeenCalledWith({ userId: 'user-1' }, { active: false });
    expect(userRepo.update).toHaveBeenCalledWith('user-1', { status: UserStatus.INACTIVE });
    const [criteria, patch] = (sessionRepo.update as jest.Mock).mock.calls[0];
    expect(criteria.userId).toBe('user-1');
    expect(patch.revokedAt).toBeInstanceOf(Date);
  });

  it('khong tim thay nhan vien thi bao 404', async () => {
    const { service } = buildService();
    await expect(service.deactivateStaff('khong-co')).rejects.toThrow(NotFoundException);
  });
});
