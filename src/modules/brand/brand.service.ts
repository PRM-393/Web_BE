import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../auth/mail.service';
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
import { BrandStatus, CampaignStatus, FavoriteTargetType, ReviewStatus, UserStatus, VoucherItemStatus } from '../../common/enums/status.enum';
import { AuditLog } from '../../entities/audit-log.entity';
import { Review } from '../../entities/review.entity';
import { Favorite } from '../../entities/favorite.entity';

import { CreateBrandDto } from './dto/create-brand.dto';
import { RegisterBrandDto } from './dto/register-brand.dto';
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
  private readonly logger = new Logger(BrandService.name);

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
    private readonly mail: MailService,
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

  // FR-BRAND-01 / FR-BRAND-02 / UC-06 buoc 1: doanh nghiep tu dang ky khi chua co tai khoan.
  // Tao User vai tro BRAND_OWNER o trang thai PENDING_ACTIVATION + Brand PENDING, roi gui lien ket
  // dat mat khau. Hai viec nay di cung nhau: duyet ho so xong ma khong dang nhap duoc thi vo nghia.
  // Lam theo dung mau cua assignStaff() de chi co mot cach tao tai khoan cho kich hoat trong repo.
  async registerBrand(dto: RegisterBrandDto) {
    const email = dto.ownerEmail.trim().toLowerCase();
    const { ownerEmail, ownerFullName, ownerPhone, ...brandFields } = dto;

    let user = await this.userRepo.findOne({ where: { email } });
    if (user && user.role !== Role.BRAND_OWNER) {
      throw new BadRequestException('Email đã thuộc tài khoản có vai trò khác.');
    }
    if (user) {
      // Da co chu thuong hieu: khong cho dang ky them ho so thu hai qua duong cong khai nay,
      // nguoi dung phai dang nhap roi dung POST /brands (NFR-SEC-03).
      const existing = await this.brandRepo.findOne({ where: { ownerUserId: user.id } });
      if (existing) {
        throw new BadRequestException(
          'Email này đã đăng ký hồ sơ thương hiệu. Vui lòng đăng nhập để xem trạng thái duyệt.',
        );
      }
    } else {
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          fullName: ownerFullName.trim(),
          phone: ownerPhone?.trim(),
          role: Role.BRAND_OWNER,
          status: UserStatus.PENDING_ACTIVATION,
        }),
      );
    }

    const brand = await this.brandRepo.save(
      this.brandRepo.create({ ...brandFields, ownerUserId: user.id, status: BrandStatus.PENDING }),
    );

    // Lien ket dat mat khau chi gui khi tai khoan chua kich hoat; sendActivation tu kiem dieu do.
    // Gui that bai khong duoc xoa ho so vua tao: nguoi dung bam lai "gui lai lien ket" o man dang nhap.
    try {
      await this.authService.sendActivation(user.email);
    } catch (error) {
      this.logger.warn(
        `Khong gui duoc lien ket dat mat khau cho ${user.email}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return {
      brandId: brand.id,
      status: brand.status,
      message:
        'Đã nhận hồ sơ thương hiệu. Vui lòng kiểm tra email để đặt mật khẩu. ' +
        'Hồ sơ sẽ được quản trị viên xét duyệt.',
    };
  }

  findMyBrands(ownerUserId: string) {
    return this.brandRepo.find({ where: { ownerUserId } });
  }

  async findOneOrFail(id: string) {
    const brand = await this.brandRepo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    return brand;
  }

  // FR-BRAND-03 / UC-06: quan tri vien duyet ho so -> gui email bao va ghi AuditLog (NFR-SEC-07)
  async approve(id: string, actorUserId: string) {
    const brand = await this.findOneOrFail(id);
    if (brand.status !== BrandStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể duyệt hồ sơ đang chờ duyệt.');
    }
    brand.status = BrandStatus.APPROVED;
    brand.approvedAt = new Date();
    const saved = await this.brandRepo.save(brand);

    await this.writeAuditLog(actorUserId, 'APPROVE_BRAND', id, { name: saved.name });
    await this.notifyOwner(
      saved,
      'Hồ sơ thương hiệu đã được duyệt',
      `Hồ sơ thương hiệu "${saved.name}" đã được duyệt. ` +
        'Bạn có thể đăng nhập vào cổng thương hiệu để tạo chi nhánh và chiến dịch voucher.',
    );
    return saved;
  }

  // FR-BRAND-03 / UC-06 luong 3a: tu choi kem ly do, ly do duoc gui vao email cho chu thuong hieu
  async reject(id: string, reason: string, actorUserId: string) {
    const brand = await this.findOneOrFail(id);
    if (brand.status !== BrandStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể từ chối hồ sơ đang chờ duyệt.');
    }
    brand.status = BrandStatus.REJECTED;
    brand.rejectReason = reason.trim();
    const saved = await this.brandRepo.save(brand);

    await this.writeAuditLog(actorUserId, 'REJECT_BRAND', id, { name: saved.name, reason: saved.rejectReason });
    await this.notifyOwner(
      saved,
      'Hồ sơ thương hiệu chưa được duyệt',
      `Hồ sơ thương hiệu "${saved.name}" chưa được duyệt. Lý do: ${saved.rejectReason}. ` +
        'Vui lòng bổ sung rồi gửi lại hồ sơ.',
    );
    return saved;
  }

  // NFR-SEC-07: moi thao tac quan tri tren ho so thuong hieu deu phai truy duoc ai lam, luc nao
  private async writeAuditLog(
    actorUserId: string | null,
    action: string,
    brandId: string,
    detail: Record<string, unknown>,
  ) {
    await this.brandRepo.manager.save(
      AuditLog,
      this.brandRepo.manager.create(AuditLog, {
        actorUserId: actorUserId ?? null,
        action,
        entityType: 'Brand',
        entityId: brandId,
        detail,
      }),
    );
  }

  // ASM-05: bao ket qua duyet ho so qua email. Trang thai thuong hieu DA luu truoc khi goi day,
  // nen SMTP chua cau hinh hoac gui that bai chi duoc ghi nhat ky - khong duoc lam hong ca thao tac
  // duyet roi de thuong hieu ket o trang thai cu.
  private async notifyOwner(brand: Brand, subject: string, body: string) {
    try {
      const owner = await this.userRepo.findOne({ where: { id: brand.ownerUserId } });
      if (!owner?.email) return;
      await this.mail.send(owner.email, subject, body);
    } catch (error) {
      this.logger.warn(
        `Khong gui duoc email "${subject}" cho chu thuong hieu ${brand.id}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  // FR-BRAND-09: danh sach thuong hieu cho quan tri (loc theo trang thai)
  findAll(status?: string) {
    const where = status && (Object.values(BrandStatus) as string[]).includes(status) ? { status: status as BrandStatus } : {};
    return this.brandRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // FR-BRAND-09 / UC-06: dinh chi thuong hieu -> moi chien dich dang ban / da duyet chuyen PAUSED (khong tao don moi),
  // don dang cho thanh toan van thanh toan not duoc (FR-CAMP-08). Ghi AuditLog.
  async suspend(id: string, reason: string, actorUserId: string) {
    if (!reason?.trim()) throw new BadRequestException('Vui lòng nhập lý do đình chỉ.');
    const brand = await this.findOneOrFail(id);
    if (brand.status !== BrandStatus.APPROVED) throw new BadRequestException('Chỉ đình chỉ được thương hiệu đang hoạt động.');
    brand.status = BrandStatus.SUSPENDED;
    brand.rejectReason = reason.trim();
    await this.brandRepo.save(brand);
    const paused = await this.campaignRepo.update(
      { brandId: id, status: In([CampaignStatus.PUBLISHED, CampaignStatus.SOLD_OUT, CampaignStatus.APPROVED]) },
      { status: CampaignStatus.PAUSED },
    );
    await this.brandRepo.manager.save(AuditLog, this.brandRepo.manager.create(AuditLog, {
      actorUserId, action: 'SUSPEND_BRAND', entityType: 'Brand', entityId: id, detail: { reason: brand.rejectReason, pausedCampaigns: paused.affected ?? 0 },
    }));
    return { ...brand, pausedCampaigns: paused.affected ?? 0 };
  }

  // Khoi phuc: thuong hieu hoat dong lai; chien dich van tam dung, thuong hieu tu mo lai tung chien dich
  async reinstate(id: string, actorUserId: string) {
    const brand = await this.findOneOrFail(id);
    if (brand.status !== BrandStatus.SUSPENDED) throw new BadRequestException('Thương hiệu không ở trạng thái đình chỉ.');
    brand.status = BrandStatus.APPROVED;
    brand.rejectReason = null as unknown as string;
    await this.brandRepo.save(brand);
    await this.brandRepo.manager.save(AuditLog, this.brandRepo.manager.create(AuditLog, {
      actorUserId, action: 'REINSTATE_BRAND', entityType: 'Brand', entityId: id, detail: {},
    }));
    return brand;
  }

  // F06 / FR-BRAND-07: trang thuong hieu cong khai cho khach (Guest xem duoc): thong tin, chi nhanh dang mo,
  // chien dich dang ban, diem danh gia trung binh (chi tinh danh gia VISIBLE), so nguoi theo doi
  async publicProfile(id: string) {
    const brand = await this.brandRepo.findOne({ where: { id, status: BrandStatus.APPROVED } });
    if (!brand) throw new NotFoundException('Không tìm thấy thương hiệu.');
    const [stores, campaigns, followers] = await Promise.all([
      this.storeRepo.find({ where: { brandId: id, status: true }, order: { name: 'ASC' } }),
      this.campaignRepo.find({
        where: { brandId: id, status: In([CampaignStatus.PUBLISHED, CampaignStatus.SOLD_OUT]) },
        order: { createdAt: 'DESC' },
      }),
      this.brandRepo.manager.count(Favorite, { where: { targetType: FavoriteTargetType.BRAND, targetId: id } }),
    ]);
    const ratings = campaigns.length
      ? await this.brandRepo.manager
          .createQueryBuilder(Review, 'r')
          .select('COUNT(r.id)', 'count')
          .addSelect('AVG(r.rating)', 'avg')
          .where('r.campaignId IN (:...ids)', { ids: campaigns.map((c) => c.id) })
          .andWhere('r.status = :visible', { visible: ReviewStatus.VISIBLE })
          .getRawOne<{ count: string; avg: string | null }>()
      : { count: '0', avg: null };
    return {
      id: brand.id,
      name: brand.name,
      logo: brand.logo,
      description: brand.description,
      contactInfo: brand.contactInfo,
      stores: stores.map(({ id: sid, name, address, latitude, longitude, phone, openingHours }) => ({ id: sid, name, address, latitude, longitude, phone, openingHours })),
      campaigns: campaigns.map((c) => ({
        ...c,
        availableQuantity: Math.max(0, c.totalQuantity - c.soldQuantity - c.reservedQuantity),
        soldOut: c.status === CampaignStatus.SOLD_OUT,
      })),
      reviewCount: Number(ratings?.count ?? 0),
      averageRating: ratings?.avg == null ? null : Math.round(Number(ratings.avg) * 10) / 10,
      followerCount: followers,
    };
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
    return { message: 'Đã vô hiệu hóa chi nhánh.' };
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
    return { message: 'Đã vô hiệu hóa nhân viên.' };
  }
}
