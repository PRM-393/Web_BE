// Quy tac nghiep vu cua F09 viet thanh ham thuan de unit test (khong phu thuoc CSDL)

const DAY_MS = 24 * 60 * 60 * 1000;

// BR-01: so da mua (moi voucher da phat hanh, ke ca da dung / het han / da hoan) + so luong trong don PENDING
// + so luong dang dat <= gioi han moi nguoi. Khong ban mot phan.
export function remainingPurchaseQuota(limitPerUser: number, issuedCount: number, pendingQuantity: number): number {
  return Math.max(0, limitPerUser - issuedCount - pendingQuantity);
}

// DC-03: ton kho kha dung = tong - da ban - dang giu cho
export function availableStock(c: { totalQuantity: number; soldQuantity: number; reservedQuantity: number }): number {
  return c.totalQuantity - c.soldQuantity - c.reservedQuantity;
}

// FR-ORDER-01: chi ban khi chien dich dang ban va trong thoi gian ban
export function isOnSale(c: { saleStartAt: Date; saleEndAt: Date }, now: Date): boolean {
  return new Date(c.saleStartAt).getTime() <= now.getTime() && now.getTime() <= new Date(c.saleEndAt).getTime();
}

// BR-05: refundableUntil = min(ngay thanh toan + windowDays, han su dung - minDaysBeforeExpire); "N ngay" = N x 24 gio (BR-25)
export function refundableUntil(paidAt: Date, voucherExpireAt: Date, windowDays = 7, minDaysBeforeExpire = 3): Date {
  return new Date(Math.min(paidAt.getTime() + windowDays * DAY_MS, new Date(voucherExpireAt).getTime() - minDaysBeforeExpire * DAY_MS));
}

// Ma voucher hien cho khach / tra cuu (DC-01, khong dung de xac nhan su dung - BR-16)
export function voucherCode(random: () => string): string {
  return `VC-${random().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}
