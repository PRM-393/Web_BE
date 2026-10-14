import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { timestampOptions } from '../config/db-types';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: false })
  readAt: boolean;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
