import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
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
import { parsePayosWebhook } from './payment-gateway';
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
  retry(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orderService.retryPayment(user.userId, id);
  }

  // Webhook JSON chung, ky HMAC-SHA256 (khong dung JWT)
  @Post('orders/payment-webhook')
  @HttpCode(200)
  @RawResponse()
  webhook(@Body() dto: PaymentWebhookDto) {
    return this.orderService.handlePaymentWebhook(dto);
  }

  // Webhook payOS (khai bao URL nay trong trang quan tri payOS). Luon tra 200 de payOS khong gui lai vo han;
  // chu ky sai thi bo qua va khong xu ly (BR-18).
  @Post('orders/payos-webhook')
  @HttpCode(200)
  @RawResponse()
  async payosWebhook(@Body() body: Record<string, unknown>) {
    const result = parsePayosWebhook(body as Parameters<typeof parsePayosWebhook>[0]);
    if (!result) return { success: false, message: 'Invalid signature' };
    const outcome = await this.orderService.handlePayosWebhook(result);
    return { success: true, outcome };
  }

  // Trang payOS chuyen khach ve (returnUrl / cancelUrl): chi bao quay lai app; ket qua that lay tu webhook (FR-ORDER-05)
  @Get('orders/payment-return')
  @RawResponse()
  @Header('Content-Type', 'text/html; charset=utf-8')
  paymentReturn(@Query() query: Record<string, string>) {
    const paid = query.status === 'PAID' && query.cancel !== 'true';
    const text = paid
      ? 'Đã nhận thanh toán. Vui lòng quay lại ứng dụng để xem voucher trong ví.'
      : 'Thanh toán chưa hoàn tất. Bạn có thể quay lại ứng dụng để thanh toán lại trong thời gian giữ chỗ.';
    return `<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voucher Platform</title><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>${text}</h2></body></html>`;
  }

  // Che do gia lap thanh toan cho demo / test khi chua co khoa payOS. Bat bang PAYMENT_SIMULATOR=true.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @Post('orders/:id/simulate-payment')
  async simulate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { success?: boolean },
  ) {
    if (process.env.PAYMENT_SIMULATOR !== 'true') throw new ForbiddenException('Chế độ giả lập thanh toán đang tắt.');
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
