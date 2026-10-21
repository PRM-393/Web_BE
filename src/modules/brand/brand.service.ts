import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { User } from '../../entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { BrandStatus, UserStatus } from '../../common/enums/status.enum';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(StaffAssignment)
    private readonly staffRepo: Repository<StaffAssignment>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private readonly sessionRepo: Repository<RefreshToken>,
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
    return this.storeRepo.save(store);
  }

  findStores(brandId: string) {
    return this.storeRepo.find({ where: { brandId } });
  }

  async deactivateStore(storeId: string) {
    await this.storeRepo.update(storeId, { status: false });
    return { message: 'Da vo hieu hoa chi nhanh.' };
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
    const existing = await this.staffRepo.find({ where: { userId: user.id }, relations: ['store'] });
    const targetStore = await this.storeRepo.findOneByOrFail({ id: dto.storeId });
    if (existing.some(a => a.store.brandId !== targetStore.brandId)) {
      throw new BadRequestException('Nhân viên đã thuộc thương hiệu khác.');
    }
    const assignment = this.staffRepo.create({
      userId: user.id,
      storeId: dto.storeId,
      active: true,
    });
    const saved = await this.staffRepo.save(assignment);
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
