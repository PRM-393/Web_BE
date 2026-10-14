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

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  // giu cho ton kho toi da 15 phut - FR-ORDER-03, BR-02
  @Column({ type: DATETIME })
  reservedUntil: Date;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;

  @Column({ type: DATETIME, nullable: true })
  paidAt: Date;
}
