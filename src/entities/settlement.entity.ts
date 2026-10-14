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
import { SettlementStatus } from '../common/enums/status.enum';

@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column({ type: DATETIME })
  periodStart: Date;

  @Column({ type: DATETIME })
  periodEnd: Date;

  @Column({ type: 'bigint' })
  grossRevenue: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  commissionRate: number;

  @Column({ type: 'bigint' })
  commissionAmount: number;

  @Column({ type: 'bigint' })
  payableAmount: number;

  @Column({ type: 'enum', enum: SettlementStatus, default: SettlementStatus.PENDING })
  status: SettlementStatus;

  @Column({ type: DATETIME, nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  bankTxnRef: string;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
