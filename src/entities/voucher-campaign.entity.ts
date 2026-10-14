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
import { Category } from './category.entity';
import { CampaignStatus, DiscountType, VoucherType } from '../common/enums/status.enum';

@Entity('voucher_campaigns')
export class VoucherCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column({ type: 'varchar', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

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

  // DISCOUNT: giam theo so tien (AMOUNT) hoac phan tram (PERCENT) - FR-CAMP-12
  @Column({ type: 'enum', enum: DiscountType, nullable: true })
  discountType: DiscountType | null;

  // AMOUNT: so tien VND; PERCENT: 1..100
  @Column({ type: 'bigint', nullable: true })
  discountValue: number | null;

  // muc giam toi da (VND), bat buoc khi PERCENT
  @Column({ type: 'bigint', nullable: true })
  maxDiscount: number | null;

  // COMBO: mo ta noi dung goi
  @Column({ type: 'text', nullable: true })
  comboItems: string | null;

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

  // thong tin gui duyet / duyet (UC-04)
  @Column({ type: DATETIME, nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  approvedBy: string | null;

  @Column({ type: DATETIME, nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
