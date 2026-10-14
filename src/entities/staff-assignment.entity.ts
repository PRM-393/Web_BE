import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { timestampOptions } from '../config/db-types';
import { User } from './user.entity';
import { Store } from './store.entity';

@Entity('staff_assignments')
export class StaffAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  storeId: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @CreateDateColumn(timestampOptions())
  assignedAt: Date;

  @Column({ default: true })
  active: boolean;
}
