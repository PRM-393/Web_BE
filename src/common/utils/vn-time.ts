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

// FR-SETTLE-03 / BR-25: moc dau va cuoi cua ky doi soat = thang TRUOC tinh theo lich Viet Nam.
// Khong dung new Date(nam, thang, ngay): ham do dung lich cuc bo cua may chu, tren Render (UTC)
// se chot nham sang thang khac trong 7 gio dau moi ngay.
export function vietnamMonthPeriod(now = new Date()): { periodStart: Date; periodEnd: Date } {
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const year = vnNow.getUTCFullYear();
  const month = vnNow.getUTCMonth(); // 0-11 theo lich VN; Date.UTC tu xu ly khi lui qua nam truoc
  return {
    // 00:00:00 gio VN ngay 01 thang truoc
    periodStart: new Date(Date.UTC(year, month - 1, 1) - VN_OFFSET_MS),
    // 23:59:59.999 gio VN ngay cuoi thang truoc = ngay 01 thang nay tru mot mili giay
    periodEnd: new Date(Date.UTC(year, month, 1) - VN_OFFSET_MS - 1),
  };
}
