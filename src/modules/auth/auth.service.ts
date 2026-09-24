import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  // TODO: thay bang Redis/DB store cho OTP thay vi in-memory Map khi trien khai that
  private otpStore = new Map<string, { code: string; expiresAt: number; requestCount: number }>();

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    let user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      user = this.userRepo.create({
        email: dto.email,
        fullName: dto.fullName,
        role: Role.CUSTOMER,
      });
      await this.userRepo.save(user);
    }
    return { message: 'Dang ky thanh cong, vui long yeu cau OTP de dang nhap.' };
  }

  // FR-AUTH-01/02/04: gui OTP 6 so, het han 5 phut, toi da 5 lan/gio/email
  async requestOtp(dto: RequestOtpDto) {
    const existing = this.otpStore.get(dto.email);
    const now = Date.now();
    if (existing && existing.requestCount >= (parseInt(process.env.OTP_MAX_REQUESTS_PER_HOUR || '5', 10))) {
      throw new BadRequestException('Ban da yeu cau OTP qua so lan cho phep, vui long thu lai sau.');
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const ttlMs = parseInt(process.env.OTP_TTL_MINUTES || '5', 10) * 60 * 1000;
    this.otpStore.set(dto.email, {
      code,
      expiresAt: now + ttlMs,
      requestCount: (existing?.requestCount || 0) + 1,
    });

    // TODO: goi service gui email that (SMTP) - khong duoc log ma OTP ra ngoai (NFR-SEC-05)
    return { message: 'Ma OTP da duoc gui qua email.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const record = this.otpStore.get(dto.email);
    if (!record || record.expiresAt < Date.now() || record.code !== dto.otp) {
      throw new UnauthorizedException('Ma OTP khong hop le hoac da het han.');
    }
    this.otpStore.delete(dto.email);

    let user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      user = this.userRepo.create({ email: dto.email, role: Role.CUSTOMER });
      await this.userRepo.save(user);
    }
    return this.issueTokens(user);
  }

  // FR-AUTH-06: BrandOwner / StoreStaff / Admin dang nhap email + mat khau
  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Sai email hoac mat khau.');
    }
    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Sai email hoac mat khau.');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh_secret',
      });
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token khong hop le.');
    }
  }

  async logout(userId: string) {
    // TODO: thu hoi refresh token cua thiet bi hien tai (FR-AUTH-08) - can bang luu revoked tokens/device
    return { message: 'Da dang xuat.' };
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret',
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh_secret',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '60d',
    });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
    };
  }
}
