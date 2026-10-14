import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { timestampOptions } from '../config/db-types';
import { Role } from '../common/enums/role.enum';

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

  @Column({ nullable: true })
  avatar: string;

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  role: Role;

  @Column({ default: true })
  status: boolean;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
