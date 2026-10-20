import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { RefreshToken } from '../../../entities/refresh-token.entity';
import { UserStatus } from '../../../common/enums/status.enum';

export interface JwtPayload { sub: string; sid: string; email: string; role: string; type: string; }

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly sessions: Repository<RefreshToken>,
  ) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'change_me_access_secret' });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'access' || !payload.sid) throw new UnauthorizedException();
    const [user, session] = await Promise.all([
      this.users.findOne({ where: { id: payload.sub, status: UserStatus.ACTIVE } }),
      this.sessions.findOne({ where: { id: payload.sid, userId: payload.sub, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) } }),
    ]);
    if (!user || !session) throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi hoặc tài khoản không hoạt động.');
    return { userId: user.id, email: user.email, role: user.role, sessionId: session.id, activeStoreId: session.activeStoreId };
  }
}
