import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfirmRefundDto } from '../report/dto/confirm-refund.dto';
import { RefundService } from './refund.service';
import { CreateRefundDto, FailManualRefundDto } from './dto/create-refund.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('refund')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('refunds')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Roles(Role.CUSTOMER)
  @Post()
  request(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRefundDto) {
    return this.refundService.requestRefund(user.userId, dto);
  }

  @Roles(Role.CUSTOMER)
  @Get('me')
  myRequests(@CurrentUser() user: CurrentUserPayload) {
    return this.refundService.findMyRequests(user.userId);
  }

  // UC-07: hang doi hoan thu cong (don lech so tien nam o GET /admin/payment-mismatches)
  @Roles(Role.ADMIN)
  @Get('manual-pending')
  manualPending() {
    return this.refundService.findManualPending();
  }

  // Da hoan tay: bat buoc nhap ma giao dich hoan
  @Roles(Role.ADMIN)
  @Patch(':id/confirm-manual')
  confirmManual(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ConfirmRefundDto,
  ) {
    return this.refundService.confirmManualRefund(id, user.userId, dto.gatewayRefundId);
  }

  // Khong hoan duoc: yeu cau FAILED, voucher duoc khoi phuc cho khach
  @Roles(Role.ADMIN)
  @Patch(':id/fail-manual')
  failManual(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: FailManualRefundDto,
  ) {
    return this.refundService.failManualRefund(id, user.userId, dto.reason);
  }
}
