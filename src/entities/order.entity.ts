import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { User } from './user.entity';
import { VoucherCampaign } from './voucher-campaign.entity';
import { OrderStatus } from '../common/enums/status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  campaignId: string;

  @ManyToOne(() => VoucherCampaign, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'campaignId' })
  campaign: VoucherCampaign;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'bigint' })
  unitPrice: number;

  @Column({ type: 'bigint' })
  totalAmount: number;

  // ty le hoa hong chot vao don tai thoi diem thanh toan - BR-09
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  commissionRate: number | null;

  // tong tien da hoan cho khach (hoan tung voucher khong doi trang thai don) - SRS 6.3
  @Column({ type: 'bigint', default: 0 })
  refundedAmount: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  // Ma so don gui sang payOS (orderCode phai la so nguyen duy nhat) - FR-ORDER-04
  @Column({ type: 'bigint', unique: true, nullable: true })
  paymentOrderCode: string | null;

  // Lien ket thanh toan payOS, het han cung reservedUntil; dung lai khi khach bam thanh toan lai (FR-ORDER-12)
  @Column({ type: 'text', nullable: true })
  paymentUrl: string | null;

  // giu cho ton kho toi da 15 phut - FR-ORDER-03, BR-02
  @Column({ type: DATETIME })
  reservedUntil: Date;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;

  @Column({ type: DATETIME, nullable: true })
  paidAt: Date;

  @Column({ type: DATETIME, nullable: true })
  cancelledAt: Date | null;
}
