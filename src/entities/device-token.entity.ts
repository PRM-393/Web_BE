import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { timestampOptions } from '../config/db-types';

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  token: string;

  @Column()
  platform: string; // android | ios

  @UpdateDateColumn(timestampOptions())
  lastActiveAt: Date;
}
