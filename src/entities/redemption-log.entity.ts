import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { timestampOptions } from '../config/db-types';
import { VoucherItem } from './voucher-item.entity';
import { Store } from './store.entity';
import { User } from './user.entity';
import { RedeemMethod } from '../common/enums/status.enum';

@Entity('redemption_logs')
export class RedemptionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  voucherItemId: string;

  @ManyToOne(() => VoucherItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voucherItemId' })
  voucherItem: VoucherItem;

  @Column()
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column()
  staffUserId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'staffUserId' })
  staffUser: User;

  // gia tri hoa don thuc te, khong bat buoc - FR-REDEEM-08
  @Column({ type: 'bigint', nullable: true })
  billAmount: number;

  @CreateDateColumn(timestampOptions())
  redeemedAt: Date;

  @Column({ type: 'enum', enum: RedeemMethod, default: RedeemMethod.QR })
  method: RedeemMethod;
}
