import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Vd: key = "commission_rate", value = "0.10" (FR-SETTLE-01, BR-09)
@Entity('system_configs')
export class SystemConfig {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ nullable: true })
  updatedBy: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
