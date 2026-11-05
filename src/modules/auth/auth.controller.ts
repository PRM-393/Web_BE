import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActivateDto, ActivationRequestDto, SelectStoreDto } from './dto/session.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto, EmailDto, ResetCodeConfirmDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

// Gioi han theo IP de chong do email / tao tai khoan rac / doan mat khau (mac dinh theo ThrottlerModule o AppModule)
@ApiTags('auth')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('check-email')
  checkEmail(@Body() dto: EmailDto) {
    return this.authService.checkEmail(dto.email);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @SkipThrottle()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.logout(user.userId, user.sessionId);
  }
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: ActivationRequestDto) { return this.authService.requestPasswordReset(dto.email); }

  @Post('password-reset/confirm')
  resetPassword(@Body() dto: ActivateDto) { return this.authService.resetPassword(dto.email, dto.token, dto.password); }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('password-reset/code-request')
  requestResetCode(@Body() dto: EmailDto) { return this.authService.requestResetCode(dto.email); }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('password-reset/code-confirm')
  resetWithCode(@Body() dto: ResetCodeConfirmDto) { return this.authService.resetWithCode(dto.email, dto.code, dto.password); }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('change-password')
  changePassword(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, user.sessionId, dto.currentPassword, dto.newPassword);
  }

  @Post('activation/request')
  requestActivation(@Body() dto: ActivationRequestDto) { return this.authService.sendActivation(dto.email); }

  @Post('activate')
  activate(@Body() dto: ActivateDto) { return this.authService.activate(dto.email, dto.token, dto.password); }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_STAFF)
  @Post('select-store')
  selectStore(@CurrentUser() user: CurrentUserPayload, @Body() dto: SelectStoreDto) {
    return this.authService.selectStore(user.userId, user.sessionId, dto.storeId);
  }
}
