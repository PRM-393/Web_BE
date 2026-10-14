// Vong doi trang thai - SRS muc 6; gia tri liet ke - SRS muc 7.1 (v1.1)

export enum UserStatus {
  PENDING_ACTIVATION = 'PENDING_ACTIVATION', // tai khoan nhan vien moi tao, chua kich hoat
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE', // bi vo hieu hoa (FR-BRAND-06)
}

export enum BrandStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED', // bi quan tri vien dinh chi (FR-BRAND-09)
}

// SRS 6.1
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  SOLD_OUT = 'SOLD_OUT', // ton kho kha dung ve 0, con thoi gian ban
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

// FR-CAMP-02, FR-CAMP-12
export enum VoucherType {
  DISCOUNT = 'DISCOUNT', // ma giam gia: discountType + discountValue (+ maxDiscount khi PERCENT)
  PREPAID = 'PREPAID', // voucher menh gia tra truoc: faceValue > salePrice
  COMBO = 'COMBO', // combo / goi dich vu: comboItems, faceValue = gia niem yet cua goi
}

export enum DiscountType {
  AMOUNT = 'AMOUNT',
  PERCENT = 'PERCENT',
}

// SRS 6.2
export enum VoucherItemStatus {
  ACTIVE = 'ACTIVE',
  REFUND_PENDING = 'REFUND_PENDING', // dang hoan tien, khong duoc redeem (BR-22)
  USED = 'USED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

// SRS 6.3
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  FULFILLED = 'FULFILLED',
  REFUNDED_OVERSOLD = 'REFUNDED_OVERSOLD',
  PAYMENT_MISMATCH = 'PAYMENT_MISMATCH', // so tien webhook khong khop tong tien don (BR-20)
}

// SRS 6.4
export enum RefundRequestStatus {
  REQUESTED = 'REQUESTED',
  PROCESSING = 'PROCESSING',
  REJECTED = 'REJECTED',
  MANUAL_PENDING = 'MANUAL_PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// SRS 6.5
export enum SettlementStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

// Ket qua giao dich thanh toan ghi tu webhook (SRS 7.1 Payment)
export enum PaymentStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Giao dich hoan tien tai cong (SRS 7.1 PaymentRefund)
export enum PaymentRefundReason {
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  OVERSOLD = 'OVERSOLD',
  MISMATCH = 'MISMATCH',
}

export enum PaymentRefundMode {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

export enum PaymentRefundStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// Muc dich ma OTP / lien ket kich hoat (SRS 7.1 OtpCode)
export enum OtpPurpose {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  ACTIVATE = 'ACTIVATE',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export enum ReviewStatus {
  VISIBLE = 'VISIBLE',
  HIDDEN = 'HIDDEN',
}

export enum FavoriteTargetType {
  BRAND = 'BRAND',
  CAMPAIGN = 'CAMPAIGN',
}

export enum RedeemMethod {
  QR = 'QR',
  OTP = 'OTP',
}
