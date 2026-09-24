import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { FavoriteTargetType } from '../common/enums/status.enum';

@Entity('favorites')
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: FavoriteTargetType })
  targetType: FavoriteTargetType;

  @Column()
  targetId: string;

  @CreateDateColumn()
  createdAt: Date;
}
