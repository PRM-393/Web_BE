import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './profile.dto';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.profile.me(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.userId, dto);
  }
}
