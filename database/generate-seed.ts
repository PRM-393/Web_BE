/* eslint-disable no-console */
// Sinh seed.sql (du lieu mau de chay thu / demo) cho PostgreSQL va MySQL tu cung mot bo du lieu.
//   npm run db:seed-sql
// Mat khau mac dinh cua cac tai khoan web: bien SEED_PASSWORD, mac dinh "Voucher@123" (chi dung khi phat trien).
// Khach hang dang nhap bang OTP nen khong co mat khau.
//
// Bo du lieu gom 2 phan:
//   1. Khoi "luong mau" (ngay CO DINH): Highlands + 3 chien dich + 1 don da thanh toan + 1 voucher.
//      Day la du lieu ma test e2e bam vao (test/app.e2e-spec.ts), ky doi soat trong test cung la ngay co dinh
//      (2026-09-30 -> 2026-10-31) nen khoi nay KHONG duoc chuyen sang ngay tuong doi.
//   2. Khoi "demo" (ngay TUONG DOI tinh tu luc sinh seed): 4 thuong hieu con lai + 12 chien dich.
//      Chay lai npm run db:seed-sql la du lieu luon tuoi, app Home khong bao gio trong.
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

type Dialect = 'postgres' | 'mysql';
type Value = string | number | boolean | null | Date;
type Row = Record<string, Value>;

const PASSWORD = process.env.SEED_PASSWORD || 'Voucher@123';
const hash = bcrypt.hashSync(PASSWORD, 10);

// Id co dinh de cac thanh vien tham chieu khi test (Postman, Swagger).
// Quy uoc: 1=category, 2=user, 3=brand, 4=store, 5=staff_assignment, 6=campaign, 7=order, 8=payment, 9=voucher.
const id = {
  // --- danh muc ---
  catCafe: '11111111-0000-4000-8000-000000000001',
  catFood: '11111111-0000-4000-8000-000000000002',
  catBeauty: '11111111-0000-4000-8000-000000000003',
  catMovie: '11111111-0000-4000-8000-000000000004',
  catShopping: '11111111-0000-4000-8000-000000000005',

  // --- tai khoan ---
  admin: '22222222-0000-4000-8000-000000000001',
  owner: '22222222-0000-4000-8000-000000000002', // Highlands
  staff: '22222222-0000-4000-8000-000000000003', // Highlands
  customer: '22222222-0000-4000-8000-000000000004',
  owner2: '22222222-0000-4000-8000-000000000005', // Phuc Long
  owner3: '22222222-0000-4000-8000-000000000006', // Pizza 4P's
  owner4: '22222222-0000-4000-8000-000000000007', // Guardian
  owner5: '22222222-0000-4000-8000-000000000008', // CGV
  owner6: '22222222-0000-4000-8000-000000000009', // Circle K - ho so dang cho duyet
  staff2: '22222222-0000-4000-8000-000000000010', // Phuc Long
  staff3: '22222222-0000-4000-8000-000000000011', // Pizza 4P's
  staff4: '22222222-0000-4000-8000-000000000012', // Guardian
  staff5: '22222222-0000-4000-8000-000000000013', // CGV

  // --- thuong hieu ---
  brand: '33333333-0000-4000-8000-000000000001', // Highlands Coffee
  brand2: '33333333-0000-4000-8000-000000000002', // Phuc Long
  brand3: '33333333-0000-4000-8000-000000000003', // Pizza 4P's
  brand4: '33333333-0000-4000-8000-000000000004', // Guardian
  brand5: '33333333-0000-4000-8000-000000000005', // CGV Cinemas
  brandPending: '33333333-0000-4000-8000-000000000006', // Circle K - PENDING, de demo duyet ho so

  // --- chi nhanh ---
  store1: '44444444-0000-4000-8000-000000000001',
  store2: '44444444-0000-4000-8000-000000000002',
  store3: '44444444-0000-4000-8000-000000000003',
  store4: '44444444-0000-4000-8000-000000000004',
  store5: '44444444-0000-4000-8000-000000000005',
  store6: '44444444-0000-4000-8000-000000000006',
  store7: '44444444-0000-4000-8000-000000000007',
  store8: '44444444-0000-4000-8000-000000000008',
  store9: '44444444-0000-4000-8000-000000000009',
  store10: '44444444-0000-4000-8000-000000000010',
  store11: '44444444-0000-4000-8000-000000000011',
  store12: '44444444-0000-4000-8000-000000000012',
  store13: '44444444-0000-4000-8000-000000000013',
  store14: '44444444-0000-4000-8000-000000000014',

  // --- gan nhan vien vao chi nhanh ---
  assign1: '55555555-0000-4000-8000-000000000001',
  assign2: '55555555-0000-4000-8000-000000000002',
  assign3: '55555555-0000-4000-8000-000000000003',
  assign4: '55555555-0000-4000-8000-000000000004',
  assign5: '55555555-0000-4000-8000-000000000005',
  assign6: '55555555-0000-4000-8000-000000000006',
  assign7: '55555555-0000-4000-8000-000000000007',

  // --- chien dich: 3 cai dau thuoc khoi luong mau, con lai la khoi demo ---
  campPublished: '66666666-0000-4000-8000-000000000001',
  campDraft: '66666666-0000-4000-8000-000000000002',
  campPending: '66666666-0000-4000-8000-000000000003',
  camp04: '66666666-0000-4000-8000-000000000004',
  camp05: '66666666-0000-4000-8000-000000000005',
  camp06: '66666666-0000-4000-8000-000000000006',
  camp07: '66666666-0000-4000-8000-000000000007',
  camp08: '66666666-0000-4000-8000-000000000008',
  camp09: '66666666-0000-4000-8000-000000000009',
  camp10: '66666666-0000-4000-8000-000000000010',
  camp11: '66666666-0000-4000-8000-000000000011',
  camp12: '66666666-0000-4000-8000-000000000012',
  camp13: '66666666-0000-4000-8000-000000000013',
  camp14: '66666666-0000-4000-8000-000000000014',
  camp15: '66666666-0000-4000-8000-000000000015',

  order: '77777777-0000-4000-8000-000000000001',
  payment: '88888888-0000-4000-8000-000000000001',
  voucher: '99999999-0000-4000-8000-000000000001',
};

// ---------------------------------------------------------------------------
// Moc thoi gian
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
const VN_OFFSET_H = 7; // Asia/Ho_Chi_Minh = UTC+7

const utc = (s: string) => new Date(`${s}Z`);

// Khoi luong mau: ban tu 01/10/2026 den 31/03/2027; han dung 30/06/2027 (>= ket thuc ban + 10 ngay, DC-10)
const saleStart = utc('2026-09-30T17:00:00');
const saleEnd = utc('2027-03-31T16:59:59');
const expire = utc('2027-06-30T16:59:59');

// Khoi demo: nhan vao gio dong ho VN roi tra ve Date UTC (CON-05 - luu UTC, hien thi gio VN).
// vn(0) = 00:00 hom nay theo gio VN; vn(3, '23:59') = 23:59 cua 3 ngay nua theo gio VN.
const genAt = new Date();
function vn(offsetDays: number, hhmm = '00:00'): Date {
  const [h, m] = hhmm.split(':').map(Number);
  // Doi "bay gio" sang gio VN de biet hom nay la ngay nao ben VN
  const vnNow = new Date(genAt.getTime() + VN_OFFSET_H * 3600000);
  return new Date(
    Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() + offsetDays, h - VN_OFFSET_H, m, 0),
  );
}
// Han dung = ket thuc ban + n ngay. BR-21 / DC-10 doi n >= 10.
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

// ---------------------------------------------------------------------------
// Du lieu
// ---------------------------------------------------------------------------

const tables: [string, Row[]][] = [
  ['categories', [
    { id: id.catCafe, name: 'Cà phê & trà', icon: 'coffee', displayOrder: 1 },
    { id: id.catFood, name: 'Ăn uống', icon: 'restaurant', displayOrder: 2 },
    { id: id.catBeauty, name: 'Làm đẹp', icon: 'spa', displayOrder: 3 },
    { id: id.catMovie, name: 'Giải trí', icon: 'movie', displayOrder: 4 },
    { id: id.catShopping, name: 'Mua sắm', icon: 'shopping_bag', displayOrder: 5 },
  ]],
  ['users', [
    { id: id.admin, email: 'admin@voucher.local', passwordHash: hash, fullName: 'Quản trị viên', role: 'ADMIN', status: 'ACTIVE' },
    { id: id.owner, email: 'owner@highlands.local', passwordHash: hash, fullName: 'Chủ Highlands', role: 'BRAND_OWNER', status: 'ACTIVE' },
    { id: id.staff, email: 'staff@highlands.local', passwordHash: hash, fullName: 'Nhân viên Lê Lợi', role: 'STORE_STAFF', status: 'ACTIVE' },
    { id: id.customer, email: 'khach@voucher.local', passwordHash: null, fullName: 'Khách hàng mẫu', phone: '0900000000', role: 'CUSTOMER', status: 'ACTIVE' },
    { id: id.owner2, email: 'owner@phuclong.local', passwordHash: hash, fullName: 'Chủ Phúc Long', role: 'BRAND_OWNER', status: 'ACTIVE' },
    { id: id.owner3, email: 'owner@pizza4ps.local', passwordHash: hash, fullName: 'Chủ Pizza 4P\'s', role: 'BRAND_OWNER', status: 'ACTIVE' },
    { id: id.owner4, email: 'owner@guardian.local', passwordHash: hash, fullName: 'Chủ Guardian', role: 'BRAND_OWNER', status: 'ACTIVE' },
    { id: id.owner5, email: 'owner@cgv.local', passwordHash: hash, fullName: 'Chủ CGV', role: 'BRAND_OWNER', status: 'ACTIVE' },
    // Chu thuong hieu co ho so dang cho duyet (demo UC-06)
    { id: id.owner6, email: 'owner@circlek.local', passwordHash: hash, fullName: 'Chủ Circle K', role: 'BRAND_OWNER', status: 'ACTIVE' },
    { id: id.staff2, email: 'staff@phuclong.local', passwordHash: hash, fullName: 'Nhân viên Phúc Long', role: 'STORE_STAFF', status: 'ACTIVE' },
    { id: id.staff3, email: 'staff@pizza4ps.local', passwordHash: hash, fullName: 'Nhân viên Pizza 4P\'s', role: 'STORE_STAFF', status: 'ACTIVE' },
    { id: id.staff4, email: 'staff@guardian.local', passwordHash: hash, fullName: 'Nhân viên Guardian', role: 'STORE_STAFF', status: 'ACTIVE' },
    { id: id.staff5, email: 'staff@cgv.local', passwordHash: hash, fullName: 'Nhân viên CGV', role: 'STORE_STAFF', status: 'ACTIVE' },
  ]],
  // 5 thuong hieu APPROVED (ban duoc) + 1 PENDING de demo duyet ho so.
  // categoryId cua BRAND la cot dung de loc theo danh muc o man Home (search.service.ts), bat buoc co.
  ['brands', [
    {
      id: id.brand, ownerUserId: id.owner, name: 'Highlands Coffee', description: 'Chuỗi cà phê Việt Nam',
      categoryId: id.catCafe, contactInfo: '1900 1755', bankInfo: 'VCB 0123456789 - CONG TY HIGHLANDS',
      status: 'APPROVED', approvedAt: utc('2026-09-01T03:00:00'),
    },
    {
      id: id.brand2, ownerUserId: id.owner2, name: 'Phúc Long', description: 'Trà và cà phê Việt Nam',
      categoryId: id.catCafe, contactInfo: '1800 6779', bankInfo: 'TCB 1902 8888 666 - CONG TY PHUC LONG',
      status: 'APPROVED', approvedAt: vn(-45, '09:00'),
    },
    {
      id: id.brand3, ownerUserId: id.owner3, name: 'Pizza 4P\'s', description: 'Nhà hàng pizza phong cách Nhật - Ý',
      categoryId: id.catFood, contactInfo: '1900 6043', bankInfo: 'ACB 2468 1357 99 - CONG TY 4P',
      status: 'APPROVED', approvedAt: vn(-40, '14:30'),
    },
    {
      id: id.brand4, ownerUserId: id.owner4, name: 'Guardian', description: 'Chuỗi cửa hàng mỹ phẩm và chăm sóc sức khỏe',
      categoryId: id.catBeauty, contactInfo: '1900 6865', bankInfo: 'BIDV 3141 5926 53 - CONG TY GUARDIAN',
      status: 'APPROVED', approvedAt: vn(-35, '10:15'),
    },
    {
      id: id.brand5, ownerUserId: id.owner5, name: 'CGV Cinemas', description: 'Hệ thống rạp chiếu phim toàn quốc',
      categoryId: id.catMovie, contactInfo: '1900 6017', bankInfo: 'VCB 0071 0004 2424 - CONG TY CGV',
      status: 'APPROVED', approvedAt: vn(-28, '16:45'),
    },
    // Ho so moi nop, chua duyet: BR-26 khong cho gui duyet chien dich nen thuong hieu nay chua co chien dich nao
    {
      id: id.brandPending, ownerUserId: id.owner6, name: 'Circle K', description: 'Chuỗi cửa hàng tiện lợi 24/7',
      categoryId: id.catShopping, contactInfo: '1900 6016', status: 'PENDING',
    },
  ]],
  // DC-05: chi nhanh dang hoat dong (status = true) bat buoc co latitude / longitude.
  // Toa do that tai TP.HCM va Ha Noi de F04 (ban do) va FR-SEARCH-05/06 (tim quanh day) dung duoc ngay.
  ['stores', [
    { id: id.store1, brandId: id.brand, name: 'Highlands Lê Lợi', address: '135 Lê Lợi, Bến Thành, Quận 1, TP.HCM', latitude: 10.7725, longitude: 106.6980, phone: '02838220000', openingHours: '07:00 - 22:00', status: true },
    { id: id.store2, brandId: id.brand, name: 'Highlands Nguyễn Huệ', address: '20 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM', latitude: 10.7740, longitude: 106.7035, phone: '02838221111', openingHours: '07:00 - 23:00', status: true },

    { id: id.store3, brandId: id.brand2, name: 'Phúc Long Lê Văn Sỹ', address: '285 Lê Văn Sỹ, Phường 1, Tân Bình, TP.HCM', latitude: 10.7920, longitude: 106.6690, phone: '02839912345', openingHours: '06:30 - 22:30', status: true },
    { id: id.store4, brandId: id.brand2, name: 'Phúc Long Hồ Gươm', address: '15 Lê Thái Tổ, Hàng Trống, Hoàn Kiếm, Hà Nội', latitude: 21.0294, longitude: 105.8520, phone: '02438260123', openingHours: '07:00 - 23:00', status: true },
    { id: id.store5, brandId: id.brand2, name: 'Phúc Long Phan Xích Long', address: '192 Phan Xích Long, Phường 2, Phú Nhuận, TP.HCM', latitude: 10.8005, longitude: 106.6880, phone: '02839956677', openingHours: '07:00 - 22:00', status: true },

    { id: id.store6, brandId: id.brand3, name: 'Pizza 4P\'s Lê Thánh Tôn', address: '8/15 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM', latitude: 10.7795, longitude: 106.7030, phone: '02838221234', openingHours: '10:00 - 22:00', status: true },
    { id: id.store7, brandId: id.brand3, name: 'Pizza 4P\'s Lý Quốc Sư', address: '11 Lý Quốc Sư, Hàng Trống, Hoàn Kiếm, Hà Nội', latitude: 21.0287, longitude: 105.8486, phone: '02438287777', openingHours: '10:00 - 22:00', status: true },

    { id: id.store8, brandId: id.brand4, name: 'Guardian Nguyễn Trãi', address: '180 Nguyễn Trãi, Phạm Ngũ Lão, Quận 1, TP.HCM', latitude: 10.7660, longitude: 106.6895, phone: '02839201122', openingHours: '08:00 - 22:00', status: true },
    { id: id.store9, brandId: id.brand4, name: 'Guardian Vincom Bà Triệu', address: '191 Bà Triệu, Lê Đại Hành, Hai Bà Trưng, Hà Nội', latitude: 21.0105, longitude: 105.8495, phone: '02439743355', openingHours: '09:30 - 22:00', status: true },
    { id: id.store10, brandId: id.brand4, name: 'Guardian Crescent Mall', address: '101 Tôn Dật Tiên, Tân Phú, Quận 7, TP.HCM', latitude: 10.7290, longitude: 106.7190, phone: '02854134466', openingHours: '09:30 - 22:00', status: true },

    { id: id.store11, brandId: id.brand5, name: 'CGV Vincom Đồng Khởi', address: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM', latitude: 10.7795, longitude: 106.7010, phone: '02839369999', openingHours: '09:00 - 23:30', status: true },
    { id: id.store12, brandId: id.brand5, name: 'CGV Vincom Nguyễn Chí Thanh', address: '54A Nguyễn Chí Thanh, Láng Thượng, Đống Đa, Hà Nội', latitude: 21.0225, longitude: 105.8085, phone: '02432668888', openingHours: '09:00 - 23:30', status: true },

    { id: id.store13, brandId: id.brandPending, name: 'Circle K Nguyễn Huệ', address: '42 Nguyễn Huệ, Bến Nghé, Quận 1, TP.HCM', latitude: 10.7745, longitude: 106.7040, phone: '02838272727', openingHours: '24/24', status: true },
    { id: id.store14, brandId: id.brandPending, name: 'Circle K Cầu Giấy', address: '108 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội', latitude: 21.0335, longitude: 105.7980, phone: '02437676767', openingHours: '24/24', status: true },
  ]],
  // BR-19 / DC-14: nhan vien chi duoc gan vao chi nhanh cua chinh thuong hieu minh
  ['staff_assignments', [
    { id: id.assign1, userId: id.staff, storeId: id.store1, active: true },
    { id: id.assign2, userId: id.staff, storeId: id.store2, active: true },
    { id: id.assign3, userId: id.staff2, storeId: id.store3, active: true },
    { id: id.assign4, userId: id.staff2, storeId: id.store5, active: true },
    { id: id.assign5, userId: id.staff3, storeId: id.store6, active: true },
    { id: id.assign6, userId: id.staff4, storeId: id.store8, active: true },
    { id: id.assign7, userId: id.staff5, storeId: id.store11, active: true },
  ]],
  // 15 chien dich, du 3 loai (DISCOUNT / PREPAID / COMBO) va du cac trang thai de demo.
  // Luu y: man Home chi hien PUBLISHED va saleStartAt <= now <= saleEndAt (search.service.ts, BR-08).
  // Muon demo the "Het hang" tren app thi de PUBLISHED voi soldQuantity + reservedQuantity = totalQuantity,
  // con SOLD_OUT that chi nhin thay o portal thuong hieu / quan tri.
  ['voucher_campaigns', [
    // --- Highlands: khoi luong mau, ngay co dinh, test e2e bam vao ---
    {
      id: id.campPublished, brandId: id.brand, categoryId: id.catCafe, title: 'Voucher 100.000đ chỉ 80.000đ', voucherType: 'PREPAID',
      description: 'Dùng cho mọi đồ uống tại Highlands', terms: 'Dùng một lần, không hoàn phần dư',
      salePrice: 80000, faceValue: 100000, totalQuantity: 200, soldQuantity: 1, reservedQuantity: 0, limitPerUser: 5,
      saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'PUBLISHED',
    },
    {
      id: id.campDraft, brandId: id.brand, categoryId: id.catCafe, title: 'Combo bánh mì + cà phê sữa', voucherType: 'COMBO', comboItems: '1 bánh mì que, 1 phin sữa đá size M',
      description: '1 bánh mì que + 1 phin sữa đá', salePrice: 45000, faceValue: 59000, totalQuantity: 100,
      limitPerUser: 5, saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'DRAFT',
    },
    {
      id: id.campPending, brandId: id.brand, categoryId: id.catCafe, title: 'Giảm 20% Phindi', voucherType: 'DISCOUNT', discountType: 'PERCENT', discountValue: 20, maxDiscount: 15000,
      salePrice: 10000, faceValue: 50000, totalQuantity: 300, limitPerUser: 3,
      saleStartAt: saleStart, saleEndAt: saleEnd, voucherExpireAt: expire, status: 'PENDING',
    },

    // --- Phuc Long: dang ban / het hang / sap ket thuc ban ---
    {
      id: id.camp04, brandId: id.brand2, categoryId: id.catCafe, title: 'Trà sữa Phúc Long mua 1 tặng 1', voucherType: 'COMBO',
      comboItems: '2 ly trà sữa Phúc Long size L', description: 'Áp dụng cả ngày, kể cả cuối tuần',
      terms: 'Mỗi lượt dùng một voucher, không quy đổi thành tiền mặt',
      salePrice: 55000, faceValue: 110000, totalQuantity: 500, soldQuantity: 124, reservedQuantity: 6, limitPerUser: 5,
      saleStartAt: vn(-20), saleEndAt: vn(120, '23:59'), voucherExpireAt: addDays(vn(120, '23:59'), 60),
      status: 'PUBLISHED', createdAt: vn(-21, '08:00'),
    },
    // Het hang nhung van PUBLISHED: the voucher tren app hien "Het hang" (ton kho kha dung = 0, DC-03)
    {
      id: id.camp05, brandId: id.brand2, categoryId: id.catCafe, title: 'Giảm 30% toàn bộ menu trà', voucherType: 'DISCOUNT',
      discountType: 'PERCENT', discountValue: 30, maxDiscount: 30000, description: 'Giảm 30% cho hóa đơn trà bất kỳ',
      terms: 'Không áp dụng cùng chương trình khuyến mãi khác',
      salePrice: 15000, faceValue: 100000, totalQuantity: 200, soldQuantity: 195, reservedQuantity: 5, limitPerUser: 2,
      saleStartAt: vn(-30), saleEndAt: vn(90, '23:59'), voucherExpireAt: addDays(vn(90, '23:59'), 45),
      status: 'PUBLISHED', createdAt: vn(-31, '09:30'),
    },
    // Sap ket thuc ban: con 3 ngay nua la het thoi gian ban
    {
      id: id.camp06, brandId: id.brand2, categoryId: id.catCafe, title: 'Phiếu 200.000đ dùng tại Phúc Long', voucherType: 'PREPAID',
      description: 'Dùng cho mọi đồ uống và bánh tại Phúc Long', terms: 'Dùng một lần, không hoàn phần dư',
      salePrice: 160000, faceValue: 200000, totalQuantity: 150, soldQuantity: 42, reservedQuantity: 0, limitPerUser: 5,
      saleStartAt: vn(-25), saleEndAt: vn(3, '23:59'), voucherExpireAt: addDays(vn(3, '23:59'), 30),
      status: 'PUBLISHED', createdAt: vn(-26, '10:00'),
    },

    // --- Pizza 4P's: dang ban / het hang that / sap het han dung ---
    {
      id: id.camp07, brandId: id.brand3, categoryId: id.catFood, title: 'Phiếu ăn uống 500.000đ tại Pizza 4P\'s', voucherType: 'PREPAID',
      description: 'Áp dụng cho toàn bộ thực đơn, kể cả đồ uống', terms: 'Không áp dụng vào ngày lễ, cần đặt bàn trước',
      salePrice: 420000, faceValue: 500000, totalQuantity: 300, soldQuantity: 68, reservedQuantity: 2, limitPerUser: 3,
      saleStartAt: vn(-10), saleEndAt: vn(150, '23:59'), voucherExpireAt: addDays(vn(150, '23:59'), 60),
      status: 'PUBLISHED', createdAt: vn(-11, '11:15'),
    },
    // SOLD_OUT that: ban het truoc khi het thoi gian ban (FR-CAMP-10), khong con hien tren app
    {
      id: id.camp08, brandId: id.brand3, categoryId: id.catFood, title: 'Combo 2 pizza cỡ M kèm 2 nước ép', voucherType: 'COMBO',
      comboItems: '2 pizza size M tùy chọn, 2 nước ép trái cây', description: 'Combo cho 2 người',
      terms: 'Dùng tại chỗ, không áp dụng mang về',
      salePrice: 350000, faceValue: 460000, totalQuantity: 100, soldQuantity: 100, reservedQuantity: 0, limitPerUser: 2,
      saleStartAt: vn(-40), saleEndAt: vn(60, '23:59'), voucherExpireAt: addDays(vn(60, '23:59'), 40),
      status: 'SOLD_OUT', createdAt: vn(-41, '13:40'),
    },
    // Ca bien DC-10: han dung dung bang ket thuc ban + 10 ngay
    {
      id: id.camp09, brandId: id.brand3, categoryId: id.catFood, title: 'Giảm 100.000đ cho hóa đơn từ 500.000đ', voucherType: 'DISCOUNT',
      discountType: 'AMOUNT', discountValue: 100000, description: 'Giảm trực tiếp trên hóa đơn',
      terms: 'Áp dụng cho hóa đơn từ 500.000đ, mỗi bàn một voucher',
      salePrice: 20000, faceValue: 100000, totalQuantity: 200, soldQuantity: 88, reservedQuantity: 0, limitPerUser: 1,
      saleStartAt: vn(-18), saleEndAt: vn(2, '23:59'), voucherExpireAt: addDays(vn(2, '23:59'), 10),
      status: 'PUBLISHED', createdAt: vn(-19, '15:20'),
    },

    // --- Guardian: dang ban / tam dung / da ket thuc ban ---
    {
      id: id.camp10, brandId: id.brand4, categoryId: id.catBeauty, title: 'Phiếu mua mỹ phẩm 300.000đ', voucherType: 'PREPAID',
      description: 'Áp dụng cho toàn bộ sản phẩm tại Guardian', terms: 'Không áp dụng cho sản phẩm đang giảm giá',
      salePrice: 250000, faceValue: 300000, totalQuantity: 400, soldQuantity: 33, reservedQuantity: 0, limitPerUser: 5,
      saleStartAt: vn(-5), saleEndAt: vn(100, '23:59'), voucherExpireAt: addDays(vn(100, '23:59'), 90),
      status: 'PUBLISHED', createdAt: vn(-6, '08:45'),
    },
    // PAUSED: khong tao don moi duoc, don PENDING cu van thanh toan not
    {
      id: id.camp11, brandId: id.brand4, categoryId: id.catBeauty, title: 'Giảm 25% sản phẩm chăm sóc da', voucherType: 'DISCOUNT',
      discountType: 'PERCENT', discountValue: 25, maxDiscount: 50000, description: 'Giảm 25% nhóm hàng chăm sóc da',
      terms: 'Mỗi hóa đơn dùng tối đa một voucher',
      salePrice: 12000, faceValue: 80000, totalQuantity: 250, soldQuantity: 11, reservedQuantity: 0, limitPerUser: 2,
      saleStartAt: vn(-15), saleEndAt: vn(80, '23:59'), voucherExpireAt: addDays(vn(80, '23:59'), 30),
      status: 'PAUSED', createdAt: vn(-16, '14:10'),
    },
    // ENDED: het thoi gian ban, nhung voucher da ban van con han dung (BR-15)
    {
      id: id.camp12, brandId: id.brand4, categoryId: id.catBeauty, title: 'Combo sữa rửa mặt và kem chống nắng', voucherType: 'COMBO',
      comboItems: '1 sữa rửa mặt 100ml, 1 kem chống nắng SPF50', description: 'Bộ đôi chăm sóc da hằng ngày',
      terms: 'Đổi tại quầy, không đổi sang sản phẩm khác',
      salePrice: 199000, faceValue: 280000, totalQuantity: 120, soldQuantity: 118, reservedQuantity: 0, limitPerUser: 2,
      saleStartAt: vn(-60), saleEndAt: vn(-5, '23:59'), voucherExpireAt: addDays(vn(-5, '23:59'), 30),
      status: 'ENDED', createdAt: vn(-61, '16:00'),
    },

    // --- CGV: dang ban / cho duyet / da duyet chua toi ngay ban ---
    {
      id: id.camp13, brandId: id.brand5, categoryId: id.catMovie, title: 'Cặp vé xem phim 2D cuối tuần', voucherType: 'COMBO',
      comboItems: '2 vé 2D ghế thường, 1 bắp rang và 2 nước ngọt', description: 'Áp dụng thứ Bảy và Chủ nhật',
      terms: 'Không áp dụng cho suất chiếu đặc biệt và phim 3D',
      salePrice: 150000, faceValue: 220000, totalQuantity: 600, soldQuantity: 234, reservedQuantity: 8, limitPerUser: 4,
      saleStartAt: vn(-25), saleEndAt: vn(70, '23:59'), voucherExpireAt: addDays(vn(70, '23:59'), 45),
      status: 'PUBLISHED', createdAt: vn(-24, '09:05'),
    },
    // PENDING: nam o hang cho duyet cua quan tri vien (UC-04)
    {
      id: id.camp14, brandId: id.brand5, categoryId: id.catMovie, title: 'Giảm 40% vé xem phim ngày thường', voucherType: 'DISCOUNT',
      discountType: 'PERCENT', discountValue: 40, maxDiscount: 60000, description: 'Áp dụng từ thứ Hai đến thứ Sáu',
      terms: 'Không áp dụng ngày lễ, tết và suất chiếu sớm',
      salePrice: 10000, faceValue: 120000, totalQuantity: 1000, soldQuantity: 0, reservedQuantity: 0, limitPerUser: 4,
      saleStartAt: vn(5), saleEndAt: vn(95, '23:59'), voucherExpireAt: addDays(vn(95, '23:59'), 40),
      status: 'PENDING', submittedAt: vn(-1, '09:30'), createdAt: vn(-2, '17:25'),
    },
    // APPROVED nhung chua toi ngay ban: job FR-CAMP-10 se tu chuyen sang PUBLISHED
    {
      id: id.camp15, brandId: id.brand5, categoryId: id.catMovie, title: 'Phiếu bắp nước 100.000đ', voucherType: 'PREPAID',
      description: 'Dùng tại quầy bắp nước của CGV', terms: 'Dùng một lần, không hoàn phần dư',
      salePrice: 80000, faceValue: 100000, totalQuantity: 350, soldQuantity: 0, reservedQuantity: 0, limitPerUser: 5,
      saleStartAt: vn(2), saleEndAt: vn(92, '23:59'), voucherExpireAt: addDays(vn(92, '23:59'), 35),
      status: 'APPROVED', submittedAt: vn(-2, '15:00'), approvedBy: id.admin, approvedAt: vn(-1, '10:00'),
      createdAt: vn(-3, '11:50'),
    },
  ]],
  // DC-07: moi chien dich phai co it nhat mot chi nhanh ap dung
  ['campaign_stores', [
    { campaignId: id.campPublished, storeId: id.store1 },
    { campaignId: id.campPublished, storeId: id.store2 },
    { campaignId: id.campDraft, storeId: id.store1 },
    { campaignId: id.campPending, storeId: id.store2 },

    { campaignId: id.camp04, storeId: id.store3 },
    { campaignId: id.camp04, storeId: id.store4 },
    { campaignId: id.camp04, storeId: id.store5 },
    { campaignId: id.camp05, storeId: id.store3 },
    { campaignId: id.camp05, storeId: id.store5 },
    { campaignId: id.camp06, storeId: id.store3 },
    { campaignId: id.camp06, storeId: id.store4 },
    { campaignId: id.camp06, storeId: id.store5 },

    { campaignId: id.camp07, storeId: id.store6 },
    { campaignId: id.camp07, storeId: id.store7 },
    { campaignId: id.camp08, storeId: id.store6 },
    { campaignId: id.camp08, storeId: id.store7 },
    { campaignId: id.camp09, storeId: id.store6 },

    { campaignId: id.camp10, storeId: id.store8 },
    { campaignId: id.camp10, storeId: id.store9 },
    { campaignId: id.camp10, storeId: id.store10 },
    { campaignId: id.camp11, storeId: id.store8 },
    { campaignId: id.camp11, storeId: id.store10 },
    { campaignId: id.camp12, storeId: id.store8 },
    { campaignId: id.camp12, storeId: id.store9 },

    { campaignId: id.camp13, storeId: id.store11 },
    { campaignId: id.camp13, storeId: id.store12 },
    { campaignId: id.camp14, storeId: id.store11 },
    { campaignId: id.camp14, storeId: id.store12 },
    { campaignId: id.camp15, storeId: id.store11 },
  ]],
  // Khach mau da mua 1 voucher de thu luong QR / OTP / hoan tien. Ngay co dinh - xem ghi chu dau file.
  ['orders', [
    {
      id: id.order, userId: id.customer, campaignId: id.campPublished, quantity: 1, unitPrice: 80000, totalAmount: 80000,
      commissionRate: 0.1, refundedAmount: 0, status: 'FULFILLED', reservedUntil: utc('2026-10-12T03:15:00'), paidAt: utc('2026-10-12T03:01:00'),
    },
  ]],
  ['payments', [
    { id: id.payment, orderId: id.order, gateway: 'VNPAY', gatewayTxnId: 'SEED-TXN-0001', amount: 80000, status: 'SUCCESS' },
  ]],
  ['voucher_items', [
    {
      id: id.voucher, orderId: id.order, campaignId: id.campPublished, userId: id.customer, code: 'HL-SEED-0001',
      secretKey: crypto.randomBytes(32).toString('hex'), status: 'ACTIVE', expireAt: expire, lockVersion: 1,
      // BR-05: min(ngay mua + 7 ngay, han su dung - 3 ngay)
      refundableUntil: utc('2026-10-19T03:01:00'),
    },
  ]],
  ['system_configs', [
    { key: 'commission_rate', value: '0.1', updatedBy: id.admin },
  ]],
];

// ---------------------------------------------------------------------------
// Tu kiem tra truoc khi ghi file: sai rang buoc thi dung han, khong sinh seed hong
// ---------------------------------------------------------------------------

function assertConstraints() {
  const errors: string[] = [];
  const rows = (t: string) => tables.find(([name]) => name === t)?.[1] ?? [];

  const brandOf = new Map(rows('stores').map((s) => [s.id as string, s.brandId as string]));
  const campaignBrand = new Map(rows('voucher_campaigns').map((c) => [c.id as string, c.brandId as string]));
  const storesWithCampaign = new Set(rows('campaign_stores').map((cs) => cs.campaignId as string));

  for (const s of rows('stores')) {
    // DC-05
    if (s.status === true && (s.latitude == null || s.longitude == null)) errors.push(`DC-05: chi nhanh ${s.name} dang hoat dong nhung thieu toa do`);
  }
  for (const c of rows('voucher_campaigns')) {
    const start = c.saleStartAt as Date;
    const end = c.saleEndAt as Date;
    const exp = c.voucherExpireAt as Date;
    // BR-21 / DC-10
    if (!(start < end)) errors.push(`DC-10: ${c.title} co saleStartAt >= saleEndAt`);
    if (exp.getTime() < end.getTime() + 10 * DAY_MS) errors.push(`DC-10: ${c.title} co voucherExpireAt som hon saleEndAt + 10 ngay`);
    // DC-03
    const sold = Number(c.soldQuantity ?? 0);
    const reserved = Number(c.reservedQuantity ?? 0);
    if (sold + reserved > Number(c.totalQuantity)) errors.push(`DC-03: ${c.title} co sold + reserved > totalQuantity`);
    // FR-CAMP-12
    if (c.voucherType === 'DISCOUNT') {
      if (!c.discountType || !c.discountValue) errors.push(`FR-CAMP-12: ${c.title} thieu discountType / discountValue`);
      if (c.discountType === 'PERCENT' && !c.maxDiscount) errors.push(`FR-CAMP-12: ${c.title} giam theo % nhung thieu maxDiscount`);
      if (c.discountType === 'PERCENT' && Number(c.discountValue) > 100) errors.push(`FR-CAMP-12: ${c.title} co discountValue > 100`);
    }
    if (c.voucherType === 'PREPAID' && Number(c.faceValue) <= Number(c.salePrice)) errors.push(`FR-CAMP-12: ${c.title} la PREPAID nhung faceValue <= salePrice`);
    if (c.voucherType === 'COMBO' && !c.comboItems) errors.push(`FR-CAMP-12: ${c.title} la COMBO nhung thieu comboItems`);
    // DC-07
    if (!storesWithCampaign.has(c.id as string)) errors.push(`DC-07: ${c.title} khong co chi nhanh ap dung nao`);
  }
  // DC-07: chi nhanh ap dung phai thuoc dung thuong hieu cua chien dich
  for (const cs of rows('campaign_stores')) {
    if (brandOf.get(cs.storeId as string) !== campaignBrand.get(cs.campaignId as string)) {
      errors.push(`campaign_stores: chi nhanh ${cs.storeId} khong thuoc thuong hieu cua chien dich ${cs.campaignId}`);
    }
  }
  // BR-19 / DC-14 kiem o muc du lieu: nhan vien cua mot thuong hieu khong duoc gan cheo sang thuong hieu khac
  const brandsOfStaff = new Map<string, Set<string>>();
  for (const a of rows('staff_assignments')) {
    const set = brandsOfStaff.get(a.userId as string) ?? new Set<string>();
    set.add(brandOf.get(a.storeId as string) as string);
    brandsOfStaff.set(a.userId as string, set);
  }
  for (const [userId, brands] of brandsOfStaff) {
    if (brands.size > 1) errors.push(`DC-14: nhan vien ${userId} bi gan vao chi nhanh cua ${brands.size} thuong hieu khac nhau`);
  }

  if (errors.length) {
    console.error('Seed vi pham rang buoc nghiep vu:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Ket xuat SQL
// ---------------------------------------------------------------------------

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
    '-- Du lieu demo dung moc ngay tuong doi: chay lai npm run db:seed-sql de lam tuoi.',
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

assertConstraints();
build('postgres');
build('mysql');
