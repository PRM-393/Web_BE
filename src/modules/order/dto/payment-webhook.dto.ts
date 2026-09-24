import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsObject, IsString } from 'class-validator';

// IPN/Webhook cong thanh toan - FR-ORDER-04/05/06, NFR-SEC-... HMAC signature xac thuc o service
export class PaymentWebhookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  gatewayTxnId: string;

  @ApiProperty()
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'SUCCESS | FAILED' })
  @IsString()
  status: string;

  @ApiProperty({ description: 'Chu ky HMAC do cong thanh toan tao, dung de xac thuc webhook' })
  @IsString()
  signature: string;

  @ApiProperty({ required: false })
  @IsObject()
  raw?: Record<string, unknown>;
}
