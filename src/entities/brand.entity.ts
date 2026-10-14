import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { BrandStatus } from '../common/enums/status.enum';
import { User } from './user.entity';
import { Category } from './category.entity';

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerUserId' })
  owner: User;

  @Column()
  name: string;

  @Column({ nullable: true })
  logo: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  categoryId: string;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ nullable: true })
  contactInfo: string;

  @Column({ nullable: true })
  bankInfo: string;

  @Column({ type: 'enum', enum: BrandStatus, default: BrandStatus.PENDING })
  status: BrandStatus;

  @Column({ nullable: true })
  rejectReason: string;

  @Column({ type: DATETIME, nullable: true })
  approvedAt: Date;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
