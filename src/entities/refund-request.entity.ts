import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { VoucherItem } from './voucher-item.entity';
import { User } from './user.entity';
import { PaymentRefund } from './payment-refund.entity';
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

  @Column({ type: DATETIME, nullable: true })
  decidedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  paymentRefundId: string | null;

  @ManyToOne(() => PaymentRefund, { nullable: true })
  @JoinColumn({ name: 'paymentRefundId' })
  paymentRefund: PaymentRefund;

  @Column({ nullable: true })
  rejectReason: string;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
