import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { VoucherCampaign } from './voucher-campaign.entity';
import { User } from './user.entity';
import { VoucherItemStatus } from '../common/enums/status.enum';

@Entity('voucher_items')
export class VoucherItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  campaignId: string;

  @ManyToOne(() => VoucherCampaign, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'campaignId' })
  campaign: VoucherCampaign;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // DC-01: duy nhat toan he thong. Chi dung de tra cuu/khieu nai, KHONG dung de xac nhan su dung (BR-16)
  @Column({ unique: true })
  code: string;

  // khoa bi mat rieng cua voucher, dung ky HMAC token QR - NFR-SEC-02
  @Column()
  secretKey: string;

  @Column({ type: 'enum', enum: VoucherItemStatus, default: VoucherItemStatus.ACTIVE })
  status: VoucherItemStatus;

  @CreateDateColumn()
  issuedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date;

  @Column({ type: 'timestamptz' })
  expireAt: Date;

  // NFR-REL-03: khoa ghi tren ban ghi khi redeem de chong redeem trung (FR-REDEEM-11, BR-12)
  @VersionColumn()
  lockVersion: number;
}
