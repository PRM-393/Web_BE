// Gio Viet Nam (UTC+7, khong doi gio mua he). May chu tren Render chay UTC nen tu quy doi,
// khong phu thuoc mui gio cua may chu.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

// "14:05 21/10/2026" - dung trong thong bao loi tra ve cho nguoi dung
export function formatVnDateTime(d: Date): string {
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())} ${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
}

// 00:00 hom nay theo gio Viet Nam (lich su redeem "trong ngay" - FR-REDEEM-10)
export function startOfVnDay(now = new Date()): Date {
  return new Date(Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS);
}

export function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
