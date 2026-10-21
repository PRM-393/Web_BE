import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, JSON_COLUMN, timestampOptions } from '../config/db-types';

// Thong bao trong app (FR-ENGAGE-06/07). Tao qua NotificationService.notify(), khong ghi truc tiep.
@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  // VOUCHER_ISSUED, VOUCHER_USED, REFUND_RESULT, VOUCHER_EXPIRING, CAMPAIGN_NEW (xem NotificationType)
  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  // Du lieu de app mo dung man hinh khi bam thong bao, vd. { orderId } / { voucherItemId } / { campaignId }
  @Column({ type: JSON_COLUMN, nullable: true })
  data: Record<string, unknown> | null;

  // Chong gui trung theo (su kien, doi tuong), vd. "VOUCHER_EXPIRING:7:<voucherId>"
  @Column({ type: 'varchar', unique: true, nullable: true })
  dedupeKey: string | null;

  @Column({ type: DATETIME, nullable: true })
  readAt: Date | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
