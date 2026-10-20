import * as crypto from 'crypto';

// Tich hop cong thanh toan (FR-ORDER-04/06, BR-18). Ho tro:
//  1. VNPay sandbox: tao URL thanh toan ky HMAC-SHA512, nhan IPN (GET vnp_*) va xac thuc chu ky.
//  2. Webhook JSON chung (POST /orders/payment-webhook) ky HMAC-SHA256 - dung cho test, demo va cong khac.
// Khoa bi mat: PAYMENT_GATEWAY_SECRET_KEY (VNPay goi la vnp_HashSecret). Tat ca chi doc tu bien moi truong.

export interface PaymentResult {
  orderId: string;
  gatewayTxnId: string;
  amount: number;
  success: boolean;
  raw: Record<string, unknown>;
}

const env = (k: string, d = '') => process.env[k] || d;
const secret = () => env('PAYMENT_GATEWAY_SECRET_KEY', 'changeme');

// Gio Viet Nam dang yyyyMMddHHmmss ma VNPay yeu cau
export function vnpTime(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}${p(vn.getUTCMonth() + 1)}${p(vn.getUTCDate())}${p(vn.getUTCHours())}${p(vn.getUTCMinutes())}${p(vn.getUTCSeconds())}`;
}

// Chuoi ky cua VNPay: tham so sap xep theo ten, gia tri encode kieu form (khoang trang -> +)
function vnpSignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

function hmac512(data: string): string {
  return crypto.createHmac('sha512', secret()).update(Buffer.from(data, 'utf-8')).digest('hex');
}

// FR-ORDER-04: lien ket thanh toan het han dung reservedUntil (BR-02)
export function buildVnpayUrl(o: { orderId: string; amount: number; expiresAt: Date; clientIp?: string; description?: string }): string {
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: env('PAYMENT_GATEWAY_MERCHANT_ID', 'changeme'),
    vnp_Amount: String(Math.round(o.amount) * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: o.orderId,
    vnp_OrderInfo: o.description || `Thanh toan don ${o.orderId}`,
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: env('PAYMENT_GATEWAY_RETURN_URL', 'http://localhost:3000/api/orders/payment-return'),
    vnp_IpAddr: o.clientIp || '127.0.0.1',
    vnp_CreateDate: vnpTime(new Date()),
    vnp_ExpireDate: vnpTime(o.expiresAt),
  };
  const query = vnpSignData(params);
  const base = env('PAYMENT_GATEWAY_BASE_URL', 'https://sandbox.vnpayment.vn').replace(/\/$/, '');
  return `${base}/paymentv2/vpcpay.html?${query}&vnp_SecureHash=${hmac512(query)}`;
}

// IPN / Return URL cua VNPay: xac thuc chu ky roi chuyen sang PaymentResult; null neu chu ky sai (BR-18)
export function parseVnpay(query: Record<string, string>): PaymentResult | null {
  if (!query.vnp_SecureHash || hmac512(vnpSignData(query)).toLowerCase() !== query.vnp_SecureHash.toLowerCase()) {
    return null;
  }
  return {
    orderId: query.vnp_TxnRef,
    gatewayTxnId: `VNPAY-${query.vnp_TransactionNo}`,
    amount: Math.round(Number(query.vnp_Amount) / 100),
    success: query.vnp_ResponseCode === '00' && (query.vnp_TransactionStatus ?? '00') === '00',
    raw: query,
  };
}

// Webhook JSON chung: signature = HMAC-SHA256(secret, "orderId|gatewayTxnId|amount|status")
export function signWebhook(p: { orderId: string; gatewayTxnId: string; amount: number; status: string }): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`${p.orderId}|${p.gatewayTxnId}|${p.amount}|${p.status}`)
    .digest('hex');
}

export function verifyWebhook(p: { orderId: string; gatewayTxnId: string; amount: number; status: string; signature: string }): boolean {
  const expected = Buffer.from(signWebhook(p));
  const given = Buffer.from(p.signature || '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
