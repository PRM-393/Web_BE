import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VoucherItem } from './voucher-item.entity';
import { User } from './user.entity';
import { RefundRequestStatus } from '../common/enums/status.enum';

@Entity('refund_requests')
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  voucherItemId: string;

  @ManyToOne(() => VoucherItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voucherItemId' })
  voucherItem: VoucherItem;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'enum', enum: RefundRequestStatus, default: RefundRequestStatus.REQUESTED })
  status: RefundRequestStatus;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date;

  @Column({ nullable: true })
  refundTxnId: string;

  @Column({ nullable: true })
  rejectReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
