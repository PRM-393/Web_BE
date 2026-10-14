import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { JSON_COLUMN, timestampOptions } from '../config/db-types';

// Nhat ky kiem toan cac thao tac quan trong: duyet, dinh chi, hoan thu cong, chi tra doi soat (NFR-SEC-07)
@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  actorUserId: string | null;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: JSON_COLUMN, nullable: true })
  detail: Record<string, unknown> | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
