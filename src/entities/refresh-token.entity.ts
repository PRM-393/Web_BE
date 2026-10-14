import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { User } from './user.entity';
import { Store } from './store.entity';

// Phien dang nhap theo thiet bi (FR-AUTH-03/08/10). Thu hoi khi dang xuat hoac nhan vien bi vo hieu hoa.
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  deviceId: string;

  // chi luu ban bam cua refresh token
  @Column({ unique: true })
  tokenHash: string;

  // chi nhanh lam viec cua nhan vien gan voi phien (FR-AUTH-12, BR-07)
  @Column({ type: 'varchar', nullable: true })
  activeStoreId: string | null;

  @ManyToOne(() => Store, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activeStoreId' })
  activeStore: Store;

  @Column({ type: DATETIME })
  expiresAt: Date;

  @Column({ type: DATETIME, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
