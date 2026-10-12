import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('order')
@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Post('orders')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('orders/me')
  myOrders(@CurrentUser() user: CurrentUserPayload) {
    return this.orderService.findMyOrders(user.userId);
  }

  // FR-REDEEM-01: vi voucher cua khach hang (app Flutter tu chia tab theo trang thai)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('wallet')
  myWallet(@CurrentUser() user: CurrentUserPayload) {
    return this.orderService.findMyVouchers(user.userId);
  }

  // Endpoint public (goi truc tiep boi cong thanh toan sandbox, xac thuc bang chu ky HMAC - khong dung JWT)
  @Post('orders/payment-webhook')
  @HttpCode(200)
  webhook(@Body() dto: PaymentWebhookDto) {
    return this.orderService.handlePaymentWebhook(dto);
  }
}
