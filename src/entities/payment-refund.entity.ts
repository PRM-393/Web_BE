import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { Payment } from './payment.entity';
import {
  PaymentRefundMode,
  PaymentRefundReason,
  PaymentRefundStatus,
} from '../common/enums/status.enum';

// Moi lan hoan tien tai cong (khach yeu cau, ban qua so luong, lech so tien) - FR-REFUND-05/06, DC-12
@Entity('payment_refunds')
export class PaymentRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  // DC-12: tong amount cua mot Payment khong vuot Payment.amount (kiem tra o service)
  @Column({ type: 'bigint' })
  amount: number;

  @Column({ type: 'enum', enum: PaymentRefundReason })
  reasonType: PaymentRefundReason;

  @Column({ type: 'enum', enum: PaymentRefundMode })
  mode: PaymentRefundMode;

  @Column({ type: 'enum', enum: PaymentRefundStatus, default: PaymentRefundStatus.PROCESSING })
  status: PaymentRefundStatus;

  @Column({ type: 'varchar', nullable: true })
  gatewayRefundId: string | null;

  // quan tri vien xac nhan khi hoan thu cong
  @Column({ type: 'varchar', nullable: true })
  processedBy: string | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;

  @Column({ type: DATETIME, nullable: true })
  completedAt: Date | null;
}
