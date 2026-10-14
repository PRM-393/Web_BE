/* eslint-disable no-console */
// Sinh seed.sql (du lieu mau de chay thu) cho PostgreSQL va MySQL tu cung mot bo du lieu.
//   npm run db:seed-sql
// Mat khau mac dinh cua cac tai khoan web: bien SEED_PASSWORD, mac dinh "Voucher@123" (chi dung khi phat trien).
// Khach hang dang nhap bang OTP nen khong co mat khau.
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

type Dialect = 'postgres' | 'mysql';
type Value = string | number | boolean | null | Date;
type Row = Record<string, Value>;

const PASSWORD = process.env.SEED_PASSWORD || 'Voucher@123';
const hash = bcrypt.hashSync(PASSWORD, 10);

// Id co dinh de cac thanh vien tham chieu khi test (Postman, Swagger)
const id = {
  catCafe: '11111111-0000-4000-8000-000000000001',
  catFood: '11111111-0000-4000-8000-000000000002',
  catBeauty: '11111111-0000-4000-8000-000000000003',
  admin: '22222222-0000-4000-8000-000000000001',
  owner: '22222222-0000-4000-8000-000000000002',
  staff: '22222222-0000-4000-8000-000000000003',
  customer: '22222222-0000-4000-8000-000000000004',
  owner2: '22222222-0000-4000-8000-000000000005',
  brand: '33333333-0000-4000-8000-000000000001',
  brandPending: '33333333-0000-4000-8000-000000000002',
  store1: '44444444-0000-4000-8000-000000000001',
  store2: '44444444-0000-4000-8000-000000000002',
  assign1: '55555555-0000-4000-8000-000000000001',
  assign2: '55555555-0000-4000-8000-000000000002',
  campPublished: '66666666-0000-4000-8000-000000000001',
  campDraft: '66666666-0000-4000-8000-000000000002',
  campPending: '66666666-0000-4000-8000-000000000003',
  order: '77777777-0000-4000-8000-000000000001',
  payment: '88888888-0000-4000-8000-000000000001',
  voucher: '99999999-0000-4000-8000-000000000001',
};

const utc = (s: string) => new Date(`${s}Z`);
// Ban tu 01/10/2026 den 31/03/2027; han dung 30/06/2027 (>= ket thuc ban + 10 ngay, DC-10)
const saleStart = utc('2026-09-30T17:00:00');
const saleEnd = utc('2027-03-31T16:59:59');
const expire = utc('2027-06-30T16:59:59');

const tables: [string, Row[]][] = [
  ['categories', [
    { id: id.catCafe, name: 'Cà phê & trà', icon: 'coffee', displayOrder: 1 },
    { id: id.catFood, name: 'Ăn uống', icon: 'restaurant', displayOrder: 2 },
    { id: id.catBeauty, name: 'Làm đẹp', icon: 'spa', displayOrder: 3 },
  ]],
  ['users', [
    { id: id.admin, email: 'admin@voucher.local', passwordHash: hash, fullName: 'Quản trị viên', role: 'ADMIN', status: true },
    { id: id.owner, email: 'owner@highlands.local', passwordHash: hash, fullName: 'Chủ Highlands', role: 'BRAND_OWNER', status: true },
    { id: id.staff, email: 'staff@highlands.local', passwordHash: hash, fullName: 'Nhân viên Lê Lợi', role: 'STORE_STAFF', status: true },
    { id: id.customer, email: 'khach@voucher.local', passwordHash: null, fullName: 'Khách hàng mẫu', phone: '0900000000', role: 'CUSTOMER', status: true },
    { id: id.owner2, email: 'owner@phuclong.local', passwordHash: hash, fullName: 'Chủ Phúc Long', role: 'BRAND_OWNER', status: true },
  ]],
  ['brands', [
    {
      id: id.brand, ownerUserId: id.owner, name: 'Highlands Coffee', description: 'Chuỗi cà phê Việt Nam',
      categoryId: id.catCafe, contactInfo: '1900 1755', bankInfo: 'VCB 0123456789 - CONG TY HIGHLANDS',
      status: 'APPROVED', approvedAt: utc('2026-09-01T03:00:00'),
    },
    {
      id: id.brandPending, ownerUserId: id.owner2, name: 'Phúc Long', description: 'Trà và cà phê',
      categoryId: id.catCafe, contactInfo: '1800 6779', status: 'PENDING',
    },
  ]],
  ['stores', [
    { id: id.store1, brandId: id.brand, name: 'Highlands Lê Lợi', address: '135 Lê Lợi, Bến Thành, Quận 1, TP.HCM', latitude: 10.7725, longitude: 106.6980, phone: '02838220000', openingHours: '07:00 - 22:00', status: true },
    { id: id.store2, brandId: id.brand, name: 'Highlands Nguyễn Huệ', address: '20 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM', latitude: 10.7740, longitude: 106.7035, phone: '02838221111', openingHours: '07:00 - 23:00', status: true },
  ]],
  ['staff_assignments', [
    { id: id.assign1, userId: id.staff, storeId: id.store1, active: true },
    { id: id.assign2, userId: id.staff, storeId: id.store2, active: true },
  ]],
  ['voucher_campaigns', [
    {
      id: id.campPublished, brandId: id.brand, title: 'Voucher 100.000đ chỉ 80.000đ', voucherType: 'PREPAID_VALUE',
      description: 'Dùng cho mọi đồ uống tại Highlands', terms: 'Dùng một lần, không hoàn phần dư (BR-03)',
      salePrice: 80000, faceValue: 100000, totalQuantity: 200, soldQuantity: 1, reservedQuantity: 0, limitPerUser: 5,
      saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'PUBLISHED',
    },
    {
      id: id.campDraft, brandId: id.brand, title: 'Combo bánh mì + cà phê sữa', voucherType: 'COMBO',
      description: '1 bánh mì que + 1 phin sữa đá', salePrice: 45000, faceValue: 59000, totalQuantity: 100,
      limitPerUser: 5, saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'DRAFT',
    },
    {
      id: id.campPending, brandId: id.brand, title: 'Giảm 20% Phindi', voucherType: 'DISCOUNT_CODE', discountPercent: 20,
      salePrice: 10000, faceValue: 50000, totalQuantity: 300, limitPerUser: 3,
      saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'PENDING',
    },
  ]],
  ['campaign_stores', [
    { campaignId: id.campPublished, storeId: id.store1 },
    { campaignId: id.campPublished, storeId: id.store2 },
    { campaignId: id.campDraft, storeId: id.store1 },
    { campaignId: id.campPending, storeId: id.store2 },
  ]],
  // Khach mau da mua 1 voucher de thu luong QR / OTP / hoan tien
  ['orders', [
    {
      id: id.order, userId: id.customer, campaignId: id.campPublished, quantity: 1, unitPrice: 80000, totalAmount: 80000,
      status: 'FULFILLED', reservedUntil: utc('2026-10-12T03:15:00'), paidAt: utc('2026-10-12T03:01:00'),
    },
  ]],
  ['payments', [
    { id: id.payment, orderId: id.order, gateway: 'VNPAY', gatewayTxnId: 'SEED-TXN-0001', amount: 80000, status: 'SUCCESS' },
  ]],
  ['voucher_items', [
    {
      id: id.voucher, orderId: id.order, campaignId: id.campPublished, userId: id.customer, code: 'HL-SEED-0001',
      secretKey: crypto.randomBytes(32).toString('hex'), status: 'ACTIVE', expireAt: expire, lockVersion: 1,
    },
  ]],
  ['system_configs', [
    { key: 'commission_rate', value: '0.1', updatedBy: id.admin },
  ]],
];

function quoteId(d: Dialect, name: string) {
  return d === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

function literal(d: Dialect, v: Value): string {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) {
    // Luu UTC: PostgreSQL ghi kem +00, MySQL dua vao SET time_zone = '+00:00'
    const s = v.toISOString().replace('T', ' ').replace('.000Z', '');
    return d === 'postgres' ? `'${s}+00'` : `'${s}'`;
  }
  return `'${v.replace(/'/g, "''")}'`;
}

function build(d: Dialect) {
  const lines = [
    '-- TU DONG SINH boi database/generate-seed.ts. Du lieu mau chi dung khi phat trien / demo.',
    `-- Chay sau schema.sql. Mat khau cac tai khoan web: ${PASSWORD}`,
    ...(d === 'mysql' ? ['SET NAMES utf8mb4;', "SET time_zone = '+00:00';"] : []),
    '',
  ];
  for (const [table, rows] of tables) {
    for (const row of rows) {
      const cols = Object.keys(row).map((c) => quoteId(d, c)).join(', ');
      const vals = Object.values(row).map((v) => literal(d, v)).join(', ');
      lines.push(`INSERT INTO ${quoteId(d, table)} (${cols}) VALUES (${vals});`);
    }
  }
  lines.push('');
  const file = path.join(__dirname, d, 'seed.sql');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`${d}: ${tables.reduce((n, [, r]) => n + r.length, 0)} dong -> database/${d}/seed.sql`);
}

build('postgres');
build('mysql');
