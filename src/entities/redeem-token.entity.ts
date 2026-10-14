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

// Token QR dong: chuoi ky HMAC, hieu luc 60 giay, dung mot lan - FR-REDEEM-02, BR-06
@Entity('redeem_tokens')
export class RedeemToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  voucherItemId: string;

  @ManyToOne(() => VoucherItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voucherItemId' })
  voucherItem: VoucherItem;

  // DC-02: duy nhat, dam bao token khong dung lai
  @Column({ unique: true })
  nonce: string;

  // ma OTP 6 chu so tuong ung, dung khi khong quet duoc QR - FR-REDEEM-03
  @Column()
  otpCode: string;

  @CreateDateColumn(timestampOptions())
  issuedAt: Date;

  @Column({ type: DATETIME })
  expiresAt: Date;

  @Column({ type: DATETIME, nullable: true })
  usedAt: Date;

  @Column({ type: DATETIME, nullable: true })
  revokedAt: Date | null;
}
