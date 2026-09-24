import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { VoucherCampaign } from './voucher-campaign.entity';
import { Store } from './store.entity';

// Danh sach chi nhanh duoc phep su dung voucher cua chien dich - FR-CAMP-03, DC-07
@Entity('campaign_stores')
export class CampaignStore {
  @PrimaryColumn()
  campaignId: string;

  @ManyToOne(() => VoucherCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: VoucherCampaign;

  @PrimaryColumn()
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;
}
