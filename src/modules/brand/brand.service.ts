import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { User } from '../../entities/user.entity';
// BR-24: can doi chieu chien dich ap dung tai chi nhanh va voucher khach dang giu
import { CampaignStore } from '../../entities/campaign-store.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Role } from '../../common/enums/role.enum';
import { BrandStatus, UserStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

// DC-05: chi nhanh dang hoat dong bat buoc co toa do, thieu thi khach khong tim duoc tren ban do (F04)
export function assertStoreCoordinates(store: { status?: boolean; latitude?: number | null; longitude?: number | null }) {
  if (store.status === false) return;
  if (store.latitude === null || store.latitude === undefined || store.longitude === null || store.longitude === undefined) {
    throw new BadRequestException('Chi nhánh đang hoạt động phải có vĩ độ và kinh độ (DC-05).');
  }
}

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(StaffAssignment)
    private readonly staffRepo: Repository<StaffAssignment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private readonly sessionRepo: Repository<RefreshToken>,
    @InjectRepository(CampaignStore) private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(VoucherCampaign) private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    private readonly authService: AuthService,
  ) {}

  // FR-BRAND-01/02: ho so moi o trang thai cho duyet
  async createBrand(ownerUserId: string, dto: CreateBrandDto) {
    const brand = this.brandRepo.create({
      ...dto,
      ownerUserId,
      status: BrandStatus.PENDING,
    });
    return this.brandRepo.save(brand);
  }

  findMyBrands(ownerUserId: string) {
    return this.brandRepo.find({ where: { ownerUserId } });
  }

  async findOneOrFail(id: string) {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Khong tim thay thuong hieu.');
    return brand;
  }

  // FR-BRAND-03: quan tri vien duyet/tu choi - TODO: gui email thong bao (ASM-05)
  async approve(id: string) {
    const brand = await this.findOneOrFail(id);
    brand.status = BrandStatus.APPROVED;
    brand.approvedAt = new Date();
    return this.brandRepo.save(brand);
  }

  async reject(id: string, reason: string) {
    const brand = await this.findOneOrFail(id);
    brand.status = BrandStatus.REJECTED;
    brand.rejectReason = reason;
    return this.brandRepo.save(brand);
  }

  // FR-BRAND-04
  async createStore(brandId: string, dto: CreateStoreDto) {
    const store = this.storeRepo.create({ ...dto, brandId, status: true });
    assertStoreCoordinates(store);
    return this.storeRepo.save(store);
  }

  findStores(brandId: string) {
    return this.storeRepo.find({ where: { brandId } });
  }

  // FR-BRAND-04: sua thong tin chi nhanh, hoac vo hieu hoa / mo lai bang truong status
  async updateStore(storeId: string, dto: UpdateStoreDto) {
    const store = await this.findStoreOrFail(storeId);
    const merged = { ...store, ...dto };
    assertStoreCoordinates(merged);
    // Doi status true -> false qua duong nay cung phai qua cua BR-24 nhu deactivateStore
    if (store.status && merged.status === false) await this.assertCanDeactivateStore(store);

    Object.assign(store, dto);
    return this.storeRepo.save(store);
  }

  async deactivateStore(storeId: string) {
    const store = await this.findStoreOrFail(storeId);
    // Chi nhanh da vo hieu roi thi khong can kiem lai, goi lai cho ket qua nhu cu
    if (store.status) await this.assertCanDeactivateStore(store);
    await this.storeRepo.update(storeId, { status: false });
    return { message: 'Da vo hieu hoa chi nhanh.' };
  }

  private async findStoreOrFail(storeId: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Không tìm thấy chi nhánh.');
    return store;
  }

  // BR-24 / FR-BRAND-08: khong duoc vo hieu hoa chi nhanh ap dung cuoi cung con hoat dong cua mot chien dich
  // ma khach con voucher dung duoc - vo hieu xong khach cam voucher con han nhung khong con cho nao de dung.
  // Viet thanh 3 truy van nho thay vi mot cau SQL long nhau cho de doc va de kiem; so chi nhanh cua mot
  // thuong hieu rat nho nen khong dang ngai ve hieu nang.
  private async assertCanDeactivateStore(store: Store) {
    const links = await this.campaignStoreRepo.find({ where: { storeId: store.id } });
    if (links.length === 0) return;

    // 1. Chien dich nao con voucher ACTIVE - dung nguyen van BR-24. Voucher dang cho hoan tien
    //    (REFUND_PENDING) khong tinh; neu hoan tien that bai no quay lai ACTIVE (F12) thi luc do chi nhanh
    //    da bi vo hieu, phai mo lai chi nhanh thu cong - da ghi lai o TASKS-THAI.md de theo doi.
    //    Voucher da qua han thi khong tinh, du cot status co the chua kip doi.
    const usable = await this.voucherItemRepo.find({
      where: {
        campaignId: In(links.map((link) => link.campaignId)),
        status: VoucherItemStatus.ACTIVE,
        expireAt: MoreThan(new Date()),
      },
      select: ['campaignId'],
    });
    const usableCampaignIds = [...new Set(usable.map((item) => item.campaignId))];
    if (usableCampaignIds.length === 0) return;

    // 2. Trong so do, chien dich nao con chi nhanh ap dung khac dang hoat dong
    const otherLinks = await this.campaignStoreRepo.find({
      where: { campaignId: In(usableCampaignIds) },
      relations: ['store'],
    });
    const stillCovered = new Set(
      otherLinks.filter((link) => link.storeId !== store.id && link.store?.status).map((link) => link.campaignId),
    );

    const blocked = usableCampaignIds.filter((id) => !stillCovered.has(id));
    if (blocked.length === 0) return;

    // 3. Lay ten chien dich de bao loi noi ro nguyen nhan, khong bat nguoi dung tu do (yeu cau giao dien)
    const campaigns = await this.campaignRepo.find({ where: { id: In(blocked) }, select: ['title'] });
    const titles = campaigns.map((campaign) => `"${campaign.title}"`).join(', ');
    throw new BadRequestException(
      `Đây là chi nhánh áp dụng cuối cùng còn hoạt động của chiến dịch ${titles} và khách vẫn còn voucher chưa dùng. ` +
        'Hãy thêm chi nhánh áp dụng khác cho chiến dịch đó rồi vô hiệu hóa lại (BR-24).',
    );
  }

  // FR-BRAND-05: tao tai khoan nhan vien va gan vao chi nhanh
  async assignStaff(dto: CreateStaffDto) {
    let user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      // Tai khoan moi cho kich hoat qua lien ket gui email (SRS 7.1 User.status)
      user = this.userRepo.create({
        email: dto.email,
        role: Role.STORE_STAFF,
        status: UserStatus.PENDING_ACTIVATION,
      });
      await this.userRepo.save(user);
    }
    if (user.role !== Role.STORE_STAFF) throw new BadRequestException('Email đã thuộc tài khoản có vai trò khác.');
    const targetStore = await this.findStoreOrFail(dto.storeId);
    const existing = await this.staffRepo.find({ where: { userId: user.id }, relations: ['store'] });
    // BR-19 / DC-14: chi nhanh phai thuoc thuong hieu cua nguoi dang goi - BrandResourceGuard chan viec do
    // ngay o tang HTTP. O day chan not truong hop nhan vien dang lam cho mot thuong hieu khac.
    if (existing.some((a) => a.store.brandId !== targetStore.brandId)) {
      throw new BadRequestException('Nhân viên đã thuộc thương hiệu khác.');
    }

    // FR-BRAND-05: mot nhan vien duoc gan nhieu chi nhanh, nhung moi chi nhanh chi mot dong.
    // Truoc day goi lai cung chi nhanh sinh dong trung, danh sach nhan vien hien ten hai lan.
    const duplicated = existing.find((a) => a.storeId === dto.storeId);
    if (duplicated?.active) throw new BadRequestException('Nhân viên này đã được gán vào chi nhánh đó.');

    // Nhan lai nguoi da nghi: mo lai dong cu thay vi tao dong moi
    const assignment = duplicated ?? this.staffRepo.create({ userId: user.id, storeId: dto.storeId });
    assignment.active = true;
    const saved = await this.staffRepo.save(assignment);

    // Vo hieu hoa nhan vien (FR-BRAND-06) da dat tai khoan ve INACTIVE va thu hoi het phien,
    // nen nhan lai thi phai dat mat khau qua lien ket kich hoat mot lan nua
    if (user.status === UserStatus.INACTIVE) {
      await this.userRepo.update(user.id, { status: UserStatus.PENDING_ACTIVATION });
      user.status = UserStatus.PENDING_ACTIVATION;
    }
    if (user.status === UserStatus.PENDING_ACTIVATION) await this.authService.sendActivation(user.email);
    return saved;
  }

  // FR-BRAND-05: danh sach nhan vien theo cac chi nhanh cua thuong hieu (chi tra thong tin can hien thi)
  async findStaff(brandId: string) {
    const assignments = await this.staffRepo.find({
      where: { store: { brandId } },
      relations: ['user', 'store'],
      order: { assignedAt: 'DESC' },
    });
    return assignments.map((a) => ({
      id: a.id,
      active: a.active,
      assignedAt: a.assignedAt,
      storeId: a.storeId,
      storeName: a.store?.name,
      email: a.user?.email,
      fullName: a.user?.fullName,
    }));
  }

  // FR-BRAND-06: disable the account and revoke every device session.
  async deactivateStaff(assignmentId: string) {
    const assignment = await this.staffRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Không tìm thấy nhân viên.');
    await this.staffRepo.update({ userId: assignment.userId }, { active: false });
    await this.userRepo.update(assignment.userId, { status: UserStatus.INACTIVE });
    await this.sessionRepo.update({ userId: assignment.userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    return { message: 'Da vo hieu hoa nhan vien.' };
  }
}
