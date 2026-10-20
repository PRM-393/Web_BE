import * as crypto from 'crypto';

// Tich hop cong thanh toan payOS (FR-ORDER-04/06, BR-18) - tai lieu: https://payos.vn/docs
//  - Tao link thanh toan: POST {PAYOS_API_URL}/v2/payment-requests, header x-client-id / x-api-key,
//    chu ky HMAC-SHA256(checksumKey, "amount=..&cancelUrl=..&description=..&orderCode=..&returnUrl=..").
//  - Webhook: payOS POST { code, desc, success, data, signature }; signature = HMAC-SHA256 tren cac truong cua data
//    sap xep theo ten (gia tri null / undefined -> chuoi rong).
//  - Webhook JSON chung ky HMAC-SHA256 (POST /orders/payment-webhook) giu lai cho test va demo.
// Khoa chi doc tu bien moi truong: PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY.

export interface PaymentResult {
  orderId: string;
  gatewayTxnId: string;
  amount: number;
  success: boolean;
  raw: Record<string, unknown>;
}

export interface PayosWebhookResult {
  orderCode: string;
  gatewayTxnId: string;
  amount: number;
  success: boolean;
  raw: Record<string, unknown>;
}

const env = (k: string, d = '') => process.env[k] || d;
const checksumKey = () => env('PAYOS_CHECKSUM_KEY', 'changeme');

export function hmacSha256(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

// Chuoi ky cua payOS: key=value noi bang &, key sap xep tang dan
export function payosSignData(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((k) => {
      const v = data[k];
      const s = v === null || v === undefined || v === 'null' || v === 'undefined' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}=${s}`;
    })
    .join('&');
}

// orderCode cua payOS phai la so nguyen duy nhat (<= 2^53): mili-giay hien tai x 1000 + 3 chu so ngau nhien
export function newPaymentOrderCode(now = Date.now()): string {
  return String(now * 1000 + crypto.randomInt(0, 1000));
}

export function payosConfigured(): boolean {
  return !!(process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY);
}

// payOS gioi han mo ta 25 ky tu, khong dau
export function payosDescription(orderCode: string): string {
  return `VC${orderCode.slice(-8)}`;
}

export function payosCreateBody(o: { orderCode: string; amount: number; expiresAt: Date }) {
  const body = {
    orderCode: Number(o.orderCode),
    amount: Math.round(o.amount),
    description: payosDescription(o.orderCode),
    returnUrl: env('PAYOS_RETURN_URL', 'http://localhost:3000/api/orders/payment-return'),
    cancelUrl: env('PAYOS_CANCEL_URL', 'http://localhost:3000/api/orders/payment-return'),
    // BR-02: lien ket het han dung reservedUntil
    expiredAt: Math.floor(o.expiresAt.getTime() / 1000),
  };
  const { amount, cancelUrl, description, orderCode, returnUrl } = body;
  const signature = hmacSha256(checksumKey(), payosSignData({ amount, cancelUrl, description, orderCode, returnUrl }));
  return { ...body, signature };
}

// Tao link thanh toan. Chua cau hinh khoa payOS -> null (dung che do gia lap thanh toan de demo).
export async function createPayosLink(o: { orderCode: string; amount: number; expiresAt: Date }): Promise<string | null> {
  if (!payosConfigured()) return null;
  const res = await fetch(`${env('PAYOS_API_URL', 'https://api-merchant.payos.vn')}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': env('PAYOS_CLIENT_ID'),
      'x-api-key': env('PAYOS_API_KEY'),
    },
    body: JSON.stringify(payosCreateBody(o)),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; desc?: string; data?: { checkoutUrl?: string } };
  if (json.code !== '00' || !json.data?.checkoutUrl) {
    throw new Error(`payOS: ${json.desc || res.status}`);
  }
  return json.data.checkoutUrl;
}

// Xac thuc webhook payOS (BR-18); null neu thieu du lieu hoac chu ky sai
export function parsePayosWebhook(body: {
  code?: string;
  success?: boolean;
  data?: Record<string, unknown>;
  signature?: string;
}): PayosWebhookResult | null {
  if (!body?.data || !body.signature) return null;
  const expected = hmacSha256(checksumKey(), payosSignData(body.data));
  if (expected !== String(body.signature).toLowerCase()) return null;
  const d = body.data;
  return {
    orderCode: String(d.orderCode),
    gatewayTxnId: `PAYOS-${d.reference ?? d.paymentLinkId ?? d.orderCode}`,
    amount: Number(d.amount),
    success: body.code === '00' && (d.code ?? '00') === '00',
    raw: body as Record<string, unknown>,
  };
}

// Webhook JSON chung: signature = HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "orderId|gatewayTxnId|amount|status")
export function signWebhook(p: { orderId: string; gatewayTxnId: string; amount: number; status: string }): string {
  return hmacSha256(env('PAYMENT_WEBHOOK_SECRET', checksumKey()), `${p.orderId}|${p.gatewayTxnId}|${p.amount}|${p.status}`);
}

export function verifyWebhook(p: { orderId: string; gatewayTxnId: string; amount: number; status: string; signature: string }): boolean {
  const expected = Buffer.from(signWebhook(p));
  const given = Buffer.from(p.signature || '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
