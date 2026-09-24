import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { CampaignStatus } from '../../common/enums/status.enum';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(VoucherCampaign)
    private readonly campaignRepo: Repository<VoucherCampaign>,
    @InjectRepository(CampaignStore)
    private readonly campaignStoreRepo: Repository<CampaignStore>,
  ) {}

  // FR-CAMP-01..05: tao chien dich o trang thai DRAFT
  async create(brandId: string, dto: CreateCampaignDto) {
    const campaign = this.campaignRepo.create({
      brandId,
      title: dto.title,
      image: dto.image,
      description: dto.description,
      terms: dto.terms,
      voucherType: dto.voucherType,
      salePrice: dto.salePrice,
      faceValue: dto.faceValue,
      discountPercent: dto.discountPercent,
      totalQuantity: dto.totalQuantity,
      limitPerUser: dto.limitPerUser ?? 5,
      saleStartAt: new Date(dto.saleStartAt),
      saleEndAt: new Date(dto.saleEndAt),
      voucherExpireAt: new Date(dto.voucherExpireAt),
      status: CampaignStatus.DRAFT,
    });
    const saved = await this.campaignRepo.save(campaign);

    const links = dto.storeIds.map((storeId) =>
      this.campaignStoreRepo.create({ campaignId: saved.id, storeId }),
    );
    await this.campaignStoreRepo.save(links);
    return saved;
  }

  findByBrand(brandId: string) {
    return this.campaignRepo.find({ where: { brandId } });
  }

  async findOneOrFail(id: string) {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Khong tim thay chien dich.');
    return campaign;
  }

  // FR-CAMP-06: gui duyet
  async submitForApproval(id: string) {
    const campaign = await this.findOneOrFail(id);
    campaign.status = CampaignStatus.PENDING;
    return this.campaignRepo.save(campaign);
  }

  // UC-04, FR-CAMP-07: quan tri vien duyet -> tu dong phat hanh khi toi ngay ban
  async approve(id: string) {
    const campaign = await this.findOneOrFail(id);
    campaign.status = CampaignStatus.APPROVED;
    // TODO: tac vu nen kiem tra saleStartAt de tu dong chuyen sang PUBLISHED (FR-CAMP-10)
    return this.campaignRepo.save(campaign);
  }

  async reject(id: string, reason: string) {
    const campaign = await this.findOneOrFail(id);
    campaign.status = CampaignStatus.DRAFT;
    campaign.rejectReason = reason;
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-08
  async pause(id: string) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.status !== CampaignStatus.PUBLISHED) {
      throw new BadRequestException('Chi co the tam dung chien dich dang ban.');
    }
    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepo.save(campaign);
  }

  async resume(id: string) {
    const campaign = await this.findOneOrFail(id);
    campaign.status = CampaignStatus.PUBLISHED;
    return this.campaignRepo.save(campaign);
  }

  // BR-17: khong duoc sua gia/gia tri/han su dung neu da ban duoc it nhat 1 voucher
  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOneOrFail(id);
    if (campaign.soldQuantity > 0) {
      const lockedFields: (keyof UpdateCampaignDto)[] = ['salePrice', 'faceValue', 'voucherExpireAt'];
      for (const field of lockedFields) {
        if (dto[field] !== undefined) {
          throw new BadRequestException(
            'Khong the sua gia ban, gia tri hoac han su dung cua chien dich da ban duoc voucher (BR-17).',
          );
        }
      }
    }
    Object.assign(campaign, dto);
    return this.campaignRepo.save(campaign);
  }

  // FR-CAMP-11: ton kho con lai theo thoi gian thuc
  async remainingStock(id: string) {
    const campaign = await this.findOneOrFail(id);
    return {
      totalQuantity: campaign.totalQuantity,
      soldQuantity: campaign.soldQuantity,
      reservedQuantity: campaign.reservedQuantity,
      remaining: campaign.totalQuantity - campaign.soldQuantity - campaign.reservedQuantity,
    };
  }

  findPendingApproval() {
    return this.campaignRepo.find({ where: { status: CampaignStatus.PENDING } });
  }
}
