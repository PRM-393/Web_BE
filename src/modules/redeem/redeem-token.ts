import * as crypto from 'crypto';

// Ma QR dong (FR-REDEEM-02, NFR-SEC-02, BR-16): "v1.<nonce>.<expiresAtMs>.<chu ky>"
//  - Khong chua id hay ma tra cuu cua voucher: voucher chi duoc xac dinh qua token luu tren may chu.
//  - Chu ky = HMAC-SHA256(REDEEM_HMAC_SECRET, "v1.<nonce>.<expiresAtMs>"), ma hoa base64url.
//  - Khoa chi doc tu bien moi truong; production thieu khoa thi khong khoi dong (xem RedeemService.onModuleInit).
export const QR_VERSION = 'v1';
const DEV_SECRET = 'dev-only-redeem-hmac-secret';

export function redeemSecret(): string {
  const secret = process.env.REDEEM_HMAC_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Thieu bien moi truong REDEEM_HMAC_SECRET (khoa ky ma QR redeem).');
  }
  return DEV_SECRET;
}

export function newNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// OTP 6 chu so tu bo sinh so ngau nhien an toan (khong dung Math.random)
export function newOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function signQr(nonce: string, expiresAtMs: number, secret = redeemSecret()): string {
  return crypto.createHmac('sha256', secret).update(`${QR_VERSION}.${nonce}.${expiresAtMs}`).digest('base64url');
}

export function buildQrPayload(nonce: string, expiresAt: Date, secret = redeemSecret()): string {
  const exp = expiresAt.getTime();
  return `${QR_VERSION}.${nonce}.${exp}.${signQr(nonce, exp, secret)}`;
}

// Tra ve nonce + han neu dung dinh dang va dung chu ky; null neu ma gia / sai dinh dang / bi sua
export function verifyQrPayload(raw: string, secret = redeemSecret()): { nonce: string; expiresAt: Date } | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 4 || parts[0] !== QR_VERSION) return null;
  const [, nonce, expRaw, signature] = parts;
  if (!/^[0-9a-f]{32}$/.test(nonce) || !/^\d{1,15}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  const expected = Buffer.from(signQr(nonce, exp, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return { nonce, expiresAt: new Date(exp) };
}
