import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface RefundGatewayRequest {
  refundRequestId: string;
  paymentId: string;
  gateway: string;
  gatewayTxnId: string;
  // so tien hoan (hoan mot phan theo don gia voucher)
  amount: number;
}

// SUCCESS: cong da hoan; DECLINED: cong tu choi (yeu cau FAILED, voucher duoc khoi phuc);
// UNAVAILABLE: khong goi duoc cong -> chuyen MANUAL_PENDING cho quan tri vien hoan tay (FR-REFUND-06)
export type RefundGatewayResult =
  | { status: 'SUCCESS'; gatewayRefundId: string }
  | { status: 'DECLINED'; message: string }
  | { status: 'UNAVAILABLE'; message: string };

// Cong hoan tien (FR-REFUND-05). Cong that chi can ke thua lop nay va dang ky lai provider trong RefundModule.
export abstract class RefundGateway {
  abstract refund(req: RefundGatewayRequest): Promise<RefundGatewayResult>;
}

// Cong thanh toan hien tai (payOS, F09) khong co API hoan tien, nen may chu dung cong gia lap sandbox:
// REFUND_SANDBOX_RESULT = success (mac dinh) | declined | unavailable de demo du ca ba nhanh.
@Injectable()
export class SandboxRefundGateway extends RefundGateway {
  async refund(_req: RefundGatewayRequest): Promise<RefundGatewayResult> {
    switch ((process.env.REFUND_SANDBOX_RESULT || 'success').toLowerCase()) {
      case 'declined':
        return { status: 'DECLINED', message: 'Cổng thanh toán từ chối giao dịch hoàn tiền.' };
      case 'unavailable':
        return { status: 'UNAVAILABLE', message: 'Cổng thanh toán tạm thời không phản hồi.' };
      default:
        return { status: 'SUCCESS', gatewayRefundId: `SBX-RF-${randomUUID()}` };
    }
  }
}
