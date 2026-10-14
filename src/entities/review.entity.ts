import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { VoucherItem } from './voucher-item.entity';
import { User } from './user.entity';
import { VoucherCampaign } from './voucher-campaign.entity';
import { ReviewStatus } from '../common/enums/status.enum';

// DC-09: moi khach chi danh gia mot lan cho moi chien dich
@Entity('reviews')
@Unique(['userId', 'campaignId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  campaignId: string;

  @ManyToOne(() => VoucherCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: VoucherCampaign;

  // voucher da USED lam can cu danh gia (BR-10)
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

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'text', nullable: true })
  brandReply: string;

  @Column({ type: DATETIME, nullable: true })
  brandRepliedAt: Date | null;

  @Column({ type: 'enum', enum: ReviewStatus, default: ReviewStatus.VISIBLE })
  status: ReviewStatus;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
