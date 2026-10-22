import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { timestampOptions } from '../config/db-types';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/status.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // null doi voi khach hang dang nhap bang OTP (FR-AUTH-02); bat buoc voi BrandOwner/StoreStaff/Admin (FR-AUTH-06)
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ nullable: true })
  fullName: string;

  @Column({ nullable: true })
  phone: string;

  // F17: data URL anh dai dien (base64, ≤ 2 MB) nen can kieu text
  @Column({ type: 'text', nullable: true })
  avatar: string;

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  role: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
