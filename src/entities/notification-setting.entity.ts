import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

// Khach bat / tat tung nhom thong bao (FR-ENGAGE). Khong co dong = dang bat.
@Entity('notification_settings')
export class NotificationSetting {
  @PrimaryColumn()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // cung gia tri voi Notification.type
  @PrimaryColumn()
  type: string;

  @Column({ default: true })
  enabled: boolean;
}
