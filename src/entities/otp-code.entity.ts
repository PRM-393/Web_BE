import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATETIME, timestampOptions } from '../config/db-types';
import { OtpPurpose } from '../common/enums/status.enum';

// Ma OTP va lien ket kich hoat (FR-AUTH-01/02, BR-23). Chi luu ban bam cua ma, khong luu ma goc.
@Entity('otp_codes')
@Index(['email', 'purpose'])
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ type: 'enum', enum: OtpPurpose })
  purpose: OtpPurpose;

  @Column()
  codeHash: string;

  // so lan nhap sai, vuot nguong thi khoa (chong do ma)
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: DATETIME })
  expiresAt: Date;

  @Column({ type: DATETIME, nullable: true })
  usedAt: Date | null;

  @CreateDateColumn(timestampOptions())
  createdAt: Date;
}
