import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DOUBLE } from '../config/db-types';
import { Brand } from './brand.entity';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  brandId: string;

  @ManyToOne(() => Brand, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column()
  name: string;

  @Column()
  address: string;

  // DC-05: khong duoc rong khi chi nhanh dang hoat dong
  @Column({ type: DOUBLE, nullable: true })
  latitude: number;

  @Column({ type: DOUBLE, nullable: true })
  longitude: number;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  openingHours: string;

  @Column({ default: true })
  status: boolean;
}
