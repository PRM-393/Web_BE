import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCampaignDto } from './create-campaign.dto';

// BR-17: khong duoc sua gia ban, gia tri, han su dung cua chien dich da ban duoc it nhat mot voucher.
// Viec kiem tra dieu kien nay thuc hien o service; DTO chi loai bo cac truong khong bao gio duoc sua qua endpoint update.
export class UpdateCampaignDto extends PartialType(
  OmitType(CreateCampaignDto, ['storeIds'] as const),
) {}
