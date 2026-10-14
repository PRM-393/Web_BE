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
import { User } from './user.entity';
import { Brand } from './brand.entity';
import { ReviewStatus } from '../common/enums/status.enum';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // moi voucher da dung chi duoc danh gia mot lan - FR-ENGAGE-03, BR-10
  @Column({ unique: true })
  voucherItemId: string;

  @ManyToOne(() => VoucherItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voucherItemId' })
  voucherItem: VoucherItem;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'text', nullable: true })
  brandReply: string;

  @Column({ type: 'enum', enum: ReviewStatus, default: ReviewStatus.VISIBLE })
  status: ReviewStatus;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
