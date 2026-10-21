import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../enums/role.enum';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Settlement } from '../../entities/settlement.entity';
import { Review } from '../../entities/review.entity';

// Role checks alone do not establish ownership of resources named in a URL/body.
@Injectable()
export class BrandResourceGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (req.user?.role !== Role.BRAND_OWNER) return true;
    const params = req.params;
    const controller = context.getClass().name;
    let brandId: string | undefined = params.brandId;
    if (controller === 'BrandController') {
      if (params.storeId || req.body?.storeId) {
        const store = await this.db.getRepository(Store).findOneBy({ id: params.storeId || req.body.storeId });
        if (!store) throw new NotFoundException('Không tìm thấy chi nhánh.');
        brandId = store.brandId;
      } else if (params.assignmentId) {
        const assignment = await this.db.getRepository(StaffAssignment).findOne({ where: { id: params.assignmentId }, relations: ['store'] });
        if (!assignment) throw new NotFoundException('Không tìm thấy nhân viên.');
        brandId = assignment.store.brandId;
      } else if (params.id) brandId = params.id;
    } else if (controller === 'CampaignController' && params.id) {
      const campaign = await this.db.getRepository(VoucherCampaign).findOneBy({ id: params.id });
      if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch.');
      brandId = campaign.brandId;
    } else if (controller === 'SettlementController' && params.id) {
      const settlement = await this.db.getRepository(Settlement).findOneBy({ id: params.id });
      if (!settlement) throw new NotFoundException('Không tìm thấy phiếu đối soát.');
      brandId = settlement.brandId;
    } else if (controller === 'EngageController' && params.id) {
      const review = await this.db.getRepository(Review).findOne({ where: { id: params.id }, relations: ['campaign'] });
      if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');
      brandId = review.campaign.brandId;
    }
    if (!brandId) return true; // Creation / current-user routes have no existing resource.
    const brand = await this.db.getRepository(Brand).findOneBy({ id: brandId });
    if (!brand || brand.ownerUserId !== req.user.userId) throw new ForbiddenException('Bạn không có quyền truy cập dữ liệu thương hiệu này.');
    if (Array.isArray(req.body?.storeIds)) {
      const stores = await this.db.getRepository(Store).findBy({ brandId });
      if (req.body.storeIds.some((id: string) => !stores.some(s => s.id === id && s.status))) {
        throw new ForbiddenException('Chi nhánh áp dụng phải thuộc thương hiệu và đang hoạt động.');
      }
    }
    return true;
  }
}
