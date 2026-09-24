// Vong doi trang thai - SRS muc 6

export enum BrandStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

export enum VoucherType {
  DISCOUNT_CODE = 'DISCOUNT_CODE', // ma giam gia (theo so tien hoac phan tram)
  PREPAID_VALUE = 'PREPAID_VALUE', // voucher menh gia tra truoc
  COMBO = 'COMBO', // combo/package
}

export enum VoucherItemStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  REFUNDED = 'REFUNDED',
  EXPIRED = 'EXPIRED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  FULFILLED = 'FULFILLED',
  REFUNDED_OVERSOLD = 'REFUNDED_OVERSOLD',
}

export enum RefundRequestStatus {
  REQUESTED = 'REQUESTED',
  PROCESSING = 'PROCESSING',
  REJECTED = 'REJECTED',
  MANUAL_PENDING = 'MANUAL_PENDING',
  COMPLETED = 'COMPLETED',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
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
