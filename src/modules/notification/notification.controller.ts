import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { NotificationService } from './notification.service';
import { RegisterDeviceTokenDto, UpdateNotificationSettingDto } from './notification.dto';

// F16: danh sach thong bao, danh dau da doc, cai dat bat / tat, dang ky thiet bi nhan push
@ApiTags('notification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.BRAND_OWNER, Role.STORE_STAFF, Role.ADMIN)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  // { items, total, page, pageSize, unread } - 20 / trang
  @Get('me')
  mine(@CurrentUser() user: CurrentUserPayload, @Query() q: PaginationQueryDto) {
    return this.notifications.listMine(user.userId, q);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  @Get('settings')
  settings(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.getSettings(user.userId);
  }

  @Put('settings')
  updateSetting(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateNotificationSettingDto) {
    return this.notifications.updateSetting(user.userId, dto.type, dto.enabled);
  }

  @Post('device-token')
  registerDevice(@CurrentUser() user: CurrentUserPayload, @Body() dto: RegisterDeviceTokenDto) {
    return this.notifications.registerDeviceToken(user.userId, dto.token, dto.platform);
  }
}
