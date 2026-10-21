import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RedeemService } from './redeem.service';
import { RequestTokenDto, RedeemDto, UpdateBillDto } from './dto/redeem.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';

@ApiTags('redeem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('redeem')
export class RedeemController {
  constructor(private readonly redeemService: RedeemService) {}

  // F10: khach sinh ma QR + OTP (60 giay)
  @Roles(Role.CUSTOMER)
  @Post('token')
  requestToken(@CurrentUser() user: CurrentUserPayload, @Body() dto: RequestTokenDto) {
    return this.redeemService.requestToken(user.userId, dto);
  }

  // F11: nhan vien xac nhan su dung tai chi nhanh dang lam trong phien
  @Roles(Role.STORE_STAFF)
  @Post()
  redeem(@CurrentUser() user: CurrentUserPayload, @Body() dto: RedeemDto) {
    if (!user.activeStoreId || user.activeStoreId !== dto.storeId) {
      throw new BusinessException(
        'STORE_NOT_SELECTED',
        'Vui lòng chọn chi nhánh làm việc trong phiên trước khi sử dụng voucher.',
      );
    }
    return this.redeemService.redeem(user.userId, dto);
  }

  // FR-AUTH-12: chi nhanh nhan vien dang duoc gan, web cua hang dung de chon chi nhanh lam viec
  @Roles(Role.STORE_STAFF)
  @Get('my-stores')
  myStores(@CurrentUser() user: CurrentUserPayload) {
    return this.redeemService.findStaffStores(user.userId);
  }

  @Roles(Role.STORE_STAFF)
  @Get('history/today')
  historyToday(@CurrentUser() user: CurrentUserPayload) {
    return this.redeemService.findStaffHistoryToday(user.userId);
  }

  // FR-REDEEM-08: sua gia tri hoa don trong 10 phut sau khi xac nhan
  @Roles(Role.STORE_STAFF)
  @Patch('logs/:id/bill')
  updateBill(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillDto,
  ) {
    return this.redeemService.updateBill(user.userId, id, dto.billAmount);
  }
}
