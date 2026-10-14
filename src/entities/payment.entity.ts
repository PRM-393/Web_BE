import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JSON_COLUMN, timestampOptions } from '../config/db-types';
import { Order } from './order.entity';
import { PaymentStatus } from '../common/enums/status.enum';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  gateway: string;

  // DC-04: duy nhat, phuc vu xu ly webhook idempotent - FR-ORDER-06
  @Column({ unique: true })
  gatewayTxnId: string;

  @Column({ type: 'bigint' })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.INITIATED })
  status: PaymentStatus;

  // luu toan bo payload tho tu webhook de doi soat, khong ghi vao log (NFR-SEC-05)
  @Column({ type: JSON_COLUMN, nullable: true })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn(timestampOptions())
  receivedAt: Date;
}
