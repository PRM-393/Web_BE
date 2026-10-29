import { Injectable, UnauthorizedException, BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID, randomBytes } from 'crypto';
import { AuditLog } from '../../entities/audit-log.entity';
import { User } from '../../entities/user.entity';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { OtpCode } from '../../entities/otp-code.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { Role } from '../../common/enums/role.enum';
import { OtpPurpose, UserStatus } from '../../common/enums/status.enum';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from './mail.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (email: string) => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  // FR-AUTH-01: man dang nhap app hoi email truoc - da co mat khau thi nhap mat khau, chua co thi chuyen sang dang ky.
  async checkEmail(email: string) {
    const user = await this.userRepo.findOne({ where: { email: normalize(email) } });
    return { registered: !!user?.passwordHash };
  }

  // FR-AUTH-01: khach tu dang ky bang email + mat khau, khong can xac thuc email; dang nhap luon sau khi tao.
  // Tai khoan khach cu (dang nhap OTP truoc day, chua co mat khau) duoc dat mat khau lan dau tai day.
  async register(dto: RegisterDto) {
    const email = normalize(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.dataSource.transaction(async (manager) => {
      await manager.createQueryBuilder().insert().into(User)
        .values({ email, role: Role.CUSTOMER, fullName: dto.fullName?.trim() || undefined }).orIgnore().execute();
      const user = await manager.findOneOrFail(User, { where: { email }, lock: { mode: 'pessimistic_write' } });
      if (user.passwordHash) throw new ConflictException('Email đã được đăng ký. Vui lòng đăng nhập.');
      if (user.role !== Role.CUSTOMER || user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('Email này không thể đăng ký tài khoản khách hàng.');
      }
      user.passwordHash = passwordHash;
      if (dto.fullName?.trim() && !user.fullName) user.fullName = dto.fullName.trim();
      await manager.save(user);
      return this.issueTokens(user, dto.deviceId, manager);
    });
  }

  async login(dto: LoginDto) {
    const email = normalize(dto.email);
    const result = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { email }, lock: { mode: 'pessimistic_write' } });
      if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) return null;
      // Rate-limit password attempts using audit events, without storing passwords.
      const recent = await manager.count(AuditLog, { where: {
        actorUserId: user.id, action: 'LOGIN_FAILURE',
        createdAt: MoreThan(new Date(Date.now() - 15 * 60000)),
      } });
      if (recent >= 5) return null;
      if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
        await manager.save(AuditLog, manager.create(AuditLog, {
          actorUserId: user.id, action: 'LOGIN_FAILURE', entityType: 'User', entityId: user.id,
        }));
        return null;
      }
      return this.issueTokens(user, dto.deviceId, manager);
    });
    if (!result) throw new UnauthorizedException('Không thể đăng nhập. Kiểm tra thông tin, trạng thái tài khoản hoặc thử lại sau 15 phút.');
    return result;
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh_secret' });
      if (payload.type !== 'refresh' || !payload.sid) throw new UnauthorizedException();
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: payload.sub }, lock: { mode: 'pessimistic_write' } });
        if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
        const session = await manager.findOne(RefreshToken, { where: {
          id: payload.sid, userId: user.id, tokenHash: hash(refreshToken),
          revokedAt: IsNull(), expiresAt: MoreThan(new Date()),
        } });
        if (!session) throw new UnauthorizedException();
        return this.issueTokens(user, session.deviceId, manager, session);
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
    }
  }

  async logout(userId: string, sessionId: string) {
    await this.dataSource.getRepository(RefreshToken).update({ id: sessionId, userId }, { revokedAt: new Date() });
    return { message: 'Đã đăng xuất.' };
  }

  async selectStore(userId: string, sessionId: string, storeId: string) {
    const assignment = await this.dataSource.getRepository(StaffAssignment).findOne({
      where: { userId, storeId, active: true, store: { status: true } },
    });
    if (!assignment) throw new BadRequestException('Bạn không được phân công tại chi nhánh đang hoạt động này.');
    await this.dataSource.getRepository(RefreshToken).update({ id: sessionId, userId, revokedAt: IsNull() }, { activeStoreId: storeId });
    return { activeStoreId: storeId };
  }

  async sendActivation(email: string) {
    const user = await this.userRepo.findOne({ where: { email: normalize(email) } });
    if (!user || user.status !== UserStatus.PENDING_ACTIVATION) return { message: 'Nếu tài khoản cần kích hoạt, email sẽ được gửi.' };
    await this.dataSource.transaction(async (manager) => {
      await manager.findOne(User, { where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
      const recent = await manager.count(OtpCode, { where: {
        email: user.email, purpose: OtpPurpose.ACTIVATE, createdAt: MoreThan(new Date(Date.now() - 3600000)),
      } });
      if (recent >= 5) throw new BadRequestException('Vui lòng thử lại sau một giờ.');
      await manager.update(OtpCode, { email: user.email, purpose: OtpPurpose.ACTIVATE, usedAt: IsNull() }, { usedAt: new Date() });
      const token = randomBytes(32).toString('hex');
      await manager.save(OtpCode, manager.create(OtpCode, {
        email: user.email, purpose: OtpPurpose.ACTIVATE, codeHash: hash(token),
        expiresAt: new Date(Date.now() + 24 * 3600000),
      }));
      const url = new URL('/#/activate', process.env.WEB_APP_URL || 'http://localhost:5173');
      url.hash = '/activate?' + new URLSearchParams({ email: user.email, token }).toString();
      await this.mail.send(user.email, 'Kích hoạt tài khoản Voucher Platform', 'Đặt mật khẩu tại ' + url.toString() + ' . Liên kết chỉ dùng một lần và có hiệu lực 24 giờ.');
    });
    return { message: 'Nếu tài khoản cần kích hoạt, email sẽ được gửi.' };
  }

  async activate(email: string, token: string, password: string) {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { email: normalize(email), status: UserStatus.PENDING_ACTIVATION }, lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new BadRequestException('Liên kết kích hoạt không hợp lệ.');
      const record = await manager.findOne(OtpCode, { where: {
        email: user.email, purpose: OtpPurpose.ACTIVATE, codeHash: hash(token),
        usedAt: IsNull(), expiresAt: MoreThan(new Date()),
      } });
      if (!record) throw new BadRequestException('Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.');
      user.passwordHash = await bcrypt.hash(password, 12);
      user.status = UserStatus.ACTIVE;
      record.usedAt = new Date();
      await manager.save(user);
      await manager.save(record);
    });
    return { message: 'Đã kích hoạt tài khoản. Bạn có thể đăng nhập.' };
  }

  // FR-AUTH-09/10: one-use reset link, 24h, revoke every session on success.
  async requestPasswordReset(email: string) {
    const message = 'Nếu tài khoản phù hợp, hướng dẫn đặt lại mật khẩu sẽ được gửi.';
    await this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { email: normalize(email) }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.role === Role.CUSTOMER || user.status !== UserStatus.ACTIVE) return;
      const recent = await manager.count(OtpCode, { where: { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, createdAt: MoreThan(new Date(Date.now() - 3600000)) } });
      if (recent >= 5) return;
      await manager.update(OtpCode, { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() }, { usedAt: new Date() });
      const token = randomBytes(32).toString('hex');
      await manager.save(OtpCode, manager.create(OtpCode, { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, codeHash: hash(token), expiresAt: new Date(Date.now() + 24 * 3600000) }));
      const url = new URL(process.env.WEB_APP_URL || 'http://localhost:5173');
      url.hash = '/reset-password?' + new URLSearchParams({ email: user.email, token }).toString();
      await this.mail.send(user.email, 'Đặt lại mật khẩu Voucher Platform', 'Đặt lại mật khẩu tại ' + url.toString() + ' . Liên kết dùng một lần trong 24 giờ.');
    });
    return { message };
  }

  async resetPassword(email: string, token: string, password: string) {
    await this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, { where: { email: normalize(email), status: UserStatus.ACTIVE }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.role === Role.CUSTOMER) throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn.');
      const record = await manager.findOne(OtpCode, { where: { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, codeHash: hash(token), usedAt: IsNull(), expiresAt: MoreThan(new Date()) } });
      if (!record) throw new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn.');
      user.passwordHash = await bcrypt.hash(password, 12);
      record.usedAt = new Date();
      await manager.save(user);
      await manager.save(record);
      await manager.update(RefreshToken, { userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    });
    return { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại trên các thiết bị.' };
  }

  // FR-AUTH-09 (app): quen mat khau - gui ma 6 so qua email, hieu luc 15 phut, sai 5 lan thi ma bi huy.
  async requestResetCode(email: string) {
    const message = 'Nếu email đã đăng ký, mã xác thực sẽ được gửi trong ít phút.';
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { email: normalize(email) }, lock: { mode: 'pessimistic_write' } });
      if (!user || !user.passwordHash || user.status !== UserStatus.ACTIVE) return;
      const recent = await manager.count(OtpCode, { where: { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, createdAt: MoreThan(new Date(Date.now() - 3600000)) } });
      if (recent >= Number(process.env.OTP_MAX_REQUESTS_PER_HOUR || 5)) {
        throw new HttpException('Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau một giờ.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = randomInt(100000, 1000000).toString();
      await manager.update(OtpCode, { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() }, { usedAt: new Date() });
      await manager.save(OtpCode, manager.create(OtpCode, {
        email: user.email, purpose: OtpPurpose.RESET_PASSWORD, codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + 15 * 60000),
      }));
      await this.mail.send(user.email, 'Mã đặt lại mật khẩu Voucher Platform',
        'Mã xác thực của bạn là ' + code + '. Mã có hiệu lực 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.');
    });
    return { message };
  }

  async resetWithCode(email: string, code: string, password: string) {
    const ok = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { email: normalize(email), status: UserStatus.ACTIVE }, lock: { mode: 'pessimistic_write' } });
      if (!user) return false;
      const record = await manager.findOne(OtpCode, {
        where: { email: user.email, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() }, order: { createdAt: 'DESC' },
      });
      if (!record || record.expiresAt <= new Date() || record.attempts >= 5) return false;
      if (!(await bcrypt.compare(code, record.codeHash))) {
        record.attempts++;
        await manager.save(record); // luu so lan sai truoc khi bao loi
        return false;
      }
      user.passwordHash = await bcrypt.hash(password, 12);
      record.usedAt = new Date();
      await manager.save(user);
      await manager.save(record);
      await manager.update(RefreshToken, { userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
      return true;
    });
    if (!ok) throw new BadRequestException('Mã xác thực không đúng, đã hết hạn hoặc đã nhập sai quá 5 lần.');
    return { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.' };
  }

  private async issueTokens(user: User, deviceId: string | undefined, manager: EntityManager, previous?: RefreshToken) {
    const session = previous || manager.create(RefreshToken, {
      id: randomUUID(), userId: user.id, deviceId: deviceId || randomUUID(), activeStoreId: null,
    });
    const payload = { sub: user.id, sid: session.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign({ ...payload, type: 'access' }, {
      secret: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret', expiresIn: '15m',
    });
    const refreshToken = this.jwtService.sign({ ...payload, type: 'refresh', jti: randomUUID() }, {
      secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh_secret', expiresIn: '60d',
    });
    session.tokenHash = hash(refreshToken);
    session.expiresAt = new Date(Date.now() + 60 * 86400000);
    await manager.save(RefreshToken, session);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName } };
  }
}
