import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../enums/role.enum';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Settlement } from '../../entities/settlement.entity';
import { Review } from '../../entities/review.entity';

// NFR-SEC-03: vai tro thoi thi chua du. @Roles chi noi "nguoi goi la chu thuong hieu", no khong noi
// "thuong hieu ghi trong duong dan la cua nguoi goi". Khong co guard nay thi mot BrandOwner doan duoc
// ma chien dich / chi nhanh cua thuong hieu khac la sua duoc ngay.
//
// JWT hien chi mang { userId, email, role }, khong co brandId, nen phai tra Brand.ownerUserId = userId.
// Moi yeu cau them nhieu nhat hai truy van theo khoa chinh nen khong dang ngai ve hieu nang; neu sau nay
// do thay cham thi nho Dat nhet brandId vao payload roi bo buoc tra Brand o day.
//
// Nguyen tac fail-closed: route nao co tham so ma guard khong biet tra thuong hieu o dau thi TU CHOI,
// khong cho qua. Nho vay mot route them sau nay se lo ra ngay thay vi lang le bo qua kiem tra quyen.
@Injectable()
export class BrandResourceGuard implements CanActivate {
  private readonly logger = new Logger(BrandResourceGuard.name);

  // Khong noi ro tai nguyen thuoc ve ai - do la thong tin cua thuong hieu khac
  private static readonly DENIED = 'Bạn không có quyền truy cập dữ liệu thương hiệu này.';

  constructor(private readonly db: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // Quyen cua ADMIN / CUSTOMER / STORE_STAFF khong gan voi mot thuong hieu cu the nen khong co gi
    // de doi chieu o day; nhung route danh rieng cho thuong hieu da duoc RolesGuard chan truoc do.
    if (req.user?.role !== Role.BRAND_OWNER) return true;

    const params = (req.params ?? {}) as Record<string, unknown>;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const brandId = await this.resolveBrandId(context, params, body);

    // null = route khong dong vao tai nguyen san co (tao thuong hieu moi, hoac doc du lieu cua chinh
    // minh ma service da loc theo userId), khong co gi de doi chieu.
    if (brandId === null) return true;

    const brand = await this.db.getRepository(Brand).findOneBy({ id: brandId });
    if (!brand || brand.ownerUserId !== req.user.userId) {
      throw new ForbiddenException(BrandResourceGuard.DENIED);
    }

    await this.assertStoresBelongToBrand(brandId, body.storeIds);
    return true;
  }

  // Tra ve ma thuong hieu so huu tai nguyen ma yeu cau dang dong vao, hoac null khi route khong dong
  // vao tai nguyen san co nao. Nem ForbiddenException khi co tham so nhung khong tra duoc.
  private async resolveBrandId(
    context: ExecutionContext,
    params: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<string | null> {
    // :brandId dat ten ro rang nen dung chung cho moi controller
    if (params.brandId !== undefined) return this.asId(params.brandId);

    const controller = context.getClass().name;
    switch (controller) {
      case 'BrandController': {
        // POST /brands/staff gui storeId trong than yeu cau (BR-19 / DC-14). Guard chay truoc
        // ValidationPipe nen gia tri chua duoc kiem kieu - chi nhan chuoi, con lai de pipe bao loi 400.
        const storeId = params.storeId ?? (typeof body.storeId === 'string' ? body.storeId : undefined);
        if (storeId !== undefined) return this.brandOfStore(this.asId(storeId));
        if (params.assignmentId !== undefined) return this.brandOfAssignment(this.asId(params.assignmentId));
        // Cac route con lai cua /brands deu co dang /brands/:id/... nen :id chinh la ma thuong hieu
        if (params.id !== undefined) return this.asId(params.id);
        break;
      }
      case 'CampaignController':
        if (params.id !== undefined) return this.brandOfCampaign(this.asId(params.id));
        break;
      case 'SettlementController':
        if (params.id !== undefined) return this.brandOfSettlement(this.asId(params.id));
        break;
      case 'EngageController':
        if (params.id !== undefined) return this.brandOfReview(this.asId(params.id));
        break;
      default:
        // Controller gan BrandResourceGuard ma chua khai bao o day: tu choi de loi lo ra ngay tu lan
        // chay dau, thay vi de endpoint chay ma khong kiem tra quyen so huu.
        this.logger.warn(`${controller} chua khai bao cach tra thuong hieu trong BrandResourceGuard - da tu choi.`);
        throw new ForbiddenException(BrandResourceGuard.DENIED);
    }

    // Co tham so nhung khong khop nhanh nao o tren: day la tai nguyen guard chua biet, khong doan bua.
    if (Object.keys(params).length > 0) {
      this.logger.warn(
        `${controller}.${context.getHandler().name}: khong tra duoc thuong hieu tu tham so ` +
          `${Object.keys(params).join(', ')} - da tu choi.`,
      );
      throw new ForbiddenException(BrandResourceGuard.DENIED);
    }
    return null;
  }

  private async brandOfStore(storeId: string) {
    const store = await this.db.getRepository(Store).findOneBy({ id: storeId });
    if (!store) throw new NotFoundException('Không tìm thấy chi nhánh.');
    return store.brandId;
  }

  private async brandOfAssignment(assignmentId: string) {
    const assignment = await this.db
      .getRepository(StaffAssignment)
      .findOne({ where: { id: assignmentId }, relations: ['store'] });
    if (!assignment) throw new NotFoundException('Không tìm thấy nhân viên.');
    return assignment.store.brandId;
  }

  private async brandOfCampaign(campaignId: string) {
    const campaign = await this.db.getRepository(VoucherCampaign).findOneBy({ id: campaignId });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
    return campaign.brandId;
  }

  private async brandOfSettlement(settlementId: string) {
    const settlement = await this.db.getRepository(Settlement).findOneBy({ id: settlementId });
    if (!settlement) throw new NotFoundException('Không tìm thấy phiếu đối soát.');
    return settlement.brandId;
  }

  private async brandOfReview(reviewId: string) {
    const review = await this.db.getRepository(Review).findOne({ where: { id: reviewId }, relations: ['campaign'] });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');
    return review.campaign.brandId;
  }

  // FR-CAMP-03 / DC-07: chi nhanh ap dung cua chien dich phai thuoc dung thuong hieu va dang hoat dong.
  // Thieu buoc nay thi chien dich tro toi chi nhanh cua thuong hieu khac, khach ra do khong dung duoc.
  private async assertStoresBelongToBrand(brandId: string, storeIds: unknown) {
    // Sai dinh dang thi de ValidationPipe tra loi 400 cho ro rang, guard khong om viec do
    if (!Array.isArray(storeIds)) return;
    const stores = await this.db.getRepository(Store).findBy({ brandId });
    const owned = (id: unknown) => stores.some((store) => store.id === id && store.status);
    if (!storeIds.every(owned)) {
      throw new ForbiddenException('Chi nhánh áp dụng phải thuộc thương hiệu và đang hoạt động.');
    }
  }

  // Tham so duong dan luon la chuoi; kiem lai de khong dua gia tri la vao truy van
  private asId(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ForbiddenException(BrandResourceGuard.DENIED);
    }
    return value;
  }
}
