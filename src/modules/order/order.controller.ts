import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { OrderService } from './order.service';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { parseVnpay } from './payment-gateway';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('order')
@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // FR-ORDER-01..04: tao don giu cho 15 phut, tra ve lien ket thanh toan
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Post('orders')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto, @Ip() ip: string) {
    return this.orderService.createOrder(user.userId, dto, ip);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('orders/me')
  myOrders(@CurrentUser() user: CurrentUserPayload) {
    return this.orderService.findMyOrders(user.userId);
  }

  // FR-ORDER-05: man ket qua tren app hoi trang thai don tu may chu
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('orders/:id')
  myOrder(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orderService.findMyOrder(user.userId, id);
  }

  // FR-ORDER-12: thanh toan lai don PENDING con trong 15 phut
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Post('orders/:id/pay')
  retry(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string, @Ip() ip: string) {
    return this.orderService.retryPayment(user.userId, id, ip);
  }

  // FR-REDEEM-01: vi voucher cua khach hang (app Flutter tu chia tab theo trang thai)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Get('wallet')
  myWallet(@CurrentUser() user: CurrentUserPayload) {
    return this.orderService.findMyVouchers(user.userId);
  }

  // Webhook JSON chung, ky HMAC-SHA256 (khong dung JWT)
  @Post('orders/payment-webhook')
  @HttpCode(200)
  @RawResponse()
  webhook(@Body() dto: PaymentWebhookDto) {
    return this.orderService.handlePaymentWebhook(dto);
  }

  // IPN cua VNPay (GET vnp_*): phai tra dung { RspCode, Message } theo tai lieu VNPay
  @Get('orders/vnpay-ipn')
  @RawResponse()
  async vnpayIpn(@Query() query: Record<string, string>) {
    const result = parseVnpay(query);
    if (!result) return { RspCode: '97', Message: 'Invalid signature' };
    try {
      const outcome = await this.orderService.processPayment(result);
      if (outcome === 'DUPLICATE') return { RspCode: '02', Message: 'Order already confirmed' };
      if (outcome === 'PAYMENT_MISMATCH') return { RspCode: '04', Message: 'Invalid amount' };
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch {
      return { RspCode: '01', Message: 'Order not found' };
    }
  }

  // Trang VNPay chuyen khach ve sau khi thanh toan: chi bao quay lai app, ket qua that lay tu IPN (FR-ORDER-05)
  @Get('orders/payment-return')
  @RawResponse()
  @Header('Content-Type', 'text/html; charset=utf-8')
  paymentReturn(@Query() query: Record<string, string>) {
    const result = parseVnpay(query);
    const text = !result
      ? 'Liên kết thanh toán không hợp lệ.'
      : result.success
        ? 'Đã nhận thanh toán. Vui lòng quay lại ứng dụng để xem voucher trong ví.'
        : 'Thanh toán chưa thành công. Bạn có thể quay lại ứng dụng để thanh toán lại trong thời gian giữ chỗ.';
    return `<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voucher Platform</title><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>${text}</h2></body></html>`;
  }

  // Che do gia lap thanh toan cho demo / test khi chua co tai khoan VNPay sandbox. Bat bang PAYMENT_SIMULATOR=true.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Post('orders/:id/simulate-payment')
  async simulate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { success?: boolean },
  ) {
    if (process.env.PAYMENT_SIMULATOR !== 'true') throw new ForbiddenException('Che do gia lap thanh toan dang tat.');
    const order = await this.orderService.findMyOrder(user.userId, id);
    const outcome = await this.orderService.processPayment({
      orderId: order.id,
      gatewayTxnId: `SIM-${uuidv4()}`,
      amount: Number(order.totalAmount),
      success: body?.success !== false,
      raw: { simulator: true },
    });
    return { outcome, order: await this.orderService.findMyOrder(user.userId, id) };
  }
}
