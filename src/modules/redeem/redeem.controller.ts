import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RedeemService } from './redeem.service';
import { RequestTokenDto, RedeemDto } from './dto/redeem.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('redeem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('redeem')
export class RedeemController {
  constructor(private readonly redeemService: RedeemService) {}

  @Roles(Role.CUSTOMER)
  @Post('token')
  requestToken(@CurrentUser() user: CurrentUserPayload, @Body() dto: RequestTokenDto) {
    return this.redeemService.requestToken(user.userId, dto);
  }

  @Roles(Role.STORE_STAFF)
  @Post()
  redeem(@CurrentUser() user: CurrentUserPayload, @Body() dto: RedeemDto) {
    return this.redeemService.redeem(user.userId, dto);
  }

  @Roles(Role.STORE_STAFF)
  @Get('history/today')
  historyToday(@CurrentUser() user: CurrentUserPayload) {
    return this.redeemService.findStaffHistoryToday(user.userId);
  }
}
