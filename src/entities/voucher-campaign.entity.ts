import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { Brand } from './brand.entity';
import { CampaignStatus, VoucherType } from '../common/enums/status.enum';

@Entity('voucher_campaigns')
export class VoucherCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column()
  title: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  terms: string;

  @Column({ type: 'enum', enum: VoucherType })
  voucherType: VoucherType;

  // gia ban thuc thu (VND, khong phan thap phan - CON-06)
  @Column({ type: 'bigint' })
  salePrice: number;

  // menh gia / gia tri voucher
  @Column({ type: 'bigint' })
  faceValue: number;

  // ap dung cho voucherType = DISCOUNT_CODE
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent: number;

  @Column({ type: 'int' })
  totalQuantity: number;

  @Column({ type: 'int', default: 0 })
  soldQuantity: number;

  // giu cho tam thoi khi tao don (TTL 15 phut) - DC-03: sold + reserved <= total
  @Column({ type: 'int', default: 0 })
  reservedQuantity: number;

  // gioi han mua moi nguoi, mac dinh 5 - BR-01
  @Column({ type: 'int', default: 5 })
  limitPerUser: number;

  @Column({ type: DATETIME })
  saleStartAt: Date;

  @Column({ type: DATETIME })
  saleEndAt: Date;

  @Column({ type: DATETIME })
  voucherExpireAt: Date;

  @Column({ type: 'enum', enum: CampaignStatus, default: CampaignStatus.DRAFT })
  status: CampaignStatus;

  @Column({ nullable: true })
  rejectReason: string;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
