# Voucher Platform API (BE)

Backend REST API cho "Nen tang ban va su dung voucher da thuong hieu" (multi-brand voucher
platform). Xay dung bang **NestJS 10** + **TypeORM** + **PostgreSQL**, phuc vu ca 4 ung dung
khach (app khach hang Flutter trong repo Mobile_App; web thuong hieu, web cua hang, web quan tri
viet bang Flutter Web trong repo Web_FE) qua mot REST API
duy nhat, xac thuc bang JWT.

Day la ban **scaffold**: cau truc module, entity, DTO, guard va route da day du theo SRS; cac
logic nghiep vu phuc tap (xac thuc chu ky HMAC webhook, tinh toan doi soat that su qua ngan hang,
tich hop Firebase/SMTP that) duoc danh dau `// TODO` kem ma yeu cau SRS tuong ung de doi phat
trien tiep trong 7 tuan.

## Yeu cau moi truong

- Node.js 20+
- PostgreSQL 13+ (mac dinh) **hoac MySQL 8.0+** - chon bang `DB_TYPE` trong `.env`

## Cai dat va chay

```bash
npm install
cp .env.example .env   # chinh sua thong tin DB/JWT/SMTP/payment gateway/Firebase
# tao bang + du lieu mau: xem database/README.md (PostgreSQL hoac MySQL)
npm run start:dev      # http://localhost:3000/api, Swagger tai /docs
```

Kiem thu:

```bash
npm run build          # bien dich
npm run test:e2e       # chay toan bo app tren PostgreSQL gia lap (pg-mem) voi database/postgres/schema.sql + seed.sql
```

Test e2e nap dung file SQL giao cho nhom, nen bao loi neu entity va schema.sql lech nhau. Sua entity xong phai
chay `npm run db:schema` roi `npm run test:e2e`. Du lieu mau co chien dich ban den 31/03/2027; qua ngay do can doi ngay trong `database/generate-seed.ts`.

Chay bang Docker (API + Postgres):

```bash
docker compose up --build
```

## Cau truc thu muc

```
src/
  main.ts                  # bootstrap, Swagger, ValidationPipe, CORS
  app.module.ts             # ghep tat ca module
  common/
    guards/                 # JwtAuthGuard, RolesGuard (phan quyen theo 5 vai tro)
    decorators/              # @Roles(), @CurrentUser()
    enums/                    # Role, cac trang thai vong doi (SRS muc 6)
    filters/                  # chuan hoa loi tra ve (NFR-USA-02)
  config/
    typeorm.config.ts        # cau hinh ket noi PostgreSQL tu bien moi truong
  entities/                  # 19 entity TypeORM day du theo SRS muc 7
  modules/
    auth/       # FR-AUTH-*   dang ky, OTP email, dang nhap mat khau, refresh, JWT strategy
    brand/      # FR-BRAND-*  ho so thuong hieu, chi nhanh, nhan vien
    campaign/   # FR-CAMP-*   CRUD chien dich, luong duyet, vong doi trang thai
    search/     # FR-SEARCH-* danh muc, tim kiem, loc, "gan toi" (TODO tinh khoang cach)
    order/      # FR-ORDER-*  tao don + giu ton kho TTL 15 phut, webhook thanh toan idempotent
    redeem/     # FR-REDEEM-* sinh token QR/OTP (TTL 60s, HMAC), redeem co khoa ban ghi
    refund/     # FR-REFUND-* yeu cau hoan tien tu dong xet duyet theo BR-05
    settlement/ # FR-SETTLE-* cau hinh hoa hong, chot doi soat thang (Cron dau thang)
    report/     # FR-REPORT-* bao cao thuong hieu, dashboard quan tri
    engage/     # FR-ENGAGE-* danh gia, yeu thich, thong bao day (TODO Firebase)
```

## Quyet dinh ky thuat

- **TypeORM** thay vi Prisma: idiomatic hon voi NestJS (`@nestjs/typeorm`), decorator-based entity
  khop truc tiep voi bang thuc the trong SRS muc 7.
- **Xac thuc**: JWT access token (15 phut) + refresh token (60 ngay) qua `@nestjs/jwt` +
  `passport-jwt`. OTP hien luu tam trong bo nho (`Map`) trong `AuthService` — **TODO (F02)** chuyen sang
  bang `otp_codes` (entity `OtpCode`, da co) va luu phien vao `refresh_tokens` (entity `RefreshToken`) de thu hoi duoc.
- **Phan quyen**: `RolesGuard` kiem tra o tang server cho moi endpoint (NFR-SEC-03), khong dua vao
  an giao dien phia client.
- **TTL giu cho ton kho / token QR**: doc tu bien moi truong (`ORDER_RESERVATION_TTL_MINUTES`,
  `REDEEM_TOKEN_TTL_SECONDS`), khong hard-code (NFR-MNT-02).
- **Webhook thanh toan**: idempotent theo `Payment.gatewayTxnId` (unique) — DC-04. Xac thuc chu ky
  HMAC la `// TODO` (BR-18), can khoa bi mat that cua cong thanh toan sandbox duoc chon.
- **Chong redeem trung**: dung `pessimistic_write` lock cua TypeORM tren `VoucherItem` trong
  transaction (NFR-REL-03, BR-12).
- **Swagger**: tu sinh tai `/docs` qua `@nestjs/swagger` (NFR-MNT-03).
- **Lich chot doi soat**: `@nestjs/schedule` Cron chay dau moi thang (UC-05).
- **CORS**: `CORS_ORIGIN` mac dinh `http://localhost:5173`, khop lenh chay Flutter Web
  `flutter run -d chrome --web-port 5173` cua repo Web_FE. App di dong khong bi CORS.

## Endpoint bo sung cho client Flutter

| Endpoint | Vai tro | Muc dich |
|---|---|---|
| `GET /wallet` | CUSTOMER | Vi voucher cua khach (khong tra secretKey) |
| `GET /redeem/my-stores` | STORE_STAFF | Chi nhanh dang duoc gan de chon chi nhanh lam viec (FR-AUTH-12) |
| `GET /brands/:id/staff` | BRAND_OWNER | Danh sach nhan vien theo chi nhanh (FR-BRAND-05) |
| `GET /admin/commission-rate` | ADMIN | Ty le hoa hong hien tai (FR-SETTLE-01) |
| `GET /admin/settlements` | ADMIN | Tat ca phieu doi soat kem ten thuong hieu (FR-SETTLE-07) |
| `GET /refunds/manual-pending` | ADMIN | Yeu cau cho hoan tien thu cong (FR-REFUND-06) |

## Bien moi truong quan trong

Xem `.env.example` day du. Cac nhom chinh: `DB_*` (PostgreSQL), `JWT_*`, `OTP_*`,
`PAYMENT_GATEWAY_*` (sandbox), `SMTP_*`, `FIREBASE_*`, `REDEEM_TOKEN_TTL_SECONDS`,
`ORDER_RESERVATION_TTL_MINUTES`, `REFUND_WINDOW_DAYS`, `DEFAULT_COMMISSION_RATE`.

## Cac TODO nghiep vu chinh con lai (xem comment trong code)

- Xac thuc chu ky HMAC webhook thanh toan that su (BR-18) — `order.service.ts`.
- Goi API hoan tien that cua cong sandbox + fallback thu cong (ASM-02) — `refund.service.ts`.
- Tinh khoang cach "gan toi" (Haversine) trong `search.service.ts` (FR-SEARCH-05/06).
- Gui email OTP that qua SMTP, gui push qua Firebase Admin SDK.
- Ghi log kiem toan cho cac thao tac quan trong vao bang `audit_logs` (NFR-SEC-07) — bang da co, chua ghi.
- Tac vu nen chuyen trang thai theo SRS 6.1: APPROVED -> PUBLISHED, PUBLISHED <-> SOLD_OUT, -> ENDED; voucher het han -> EXPIRED (tru REFUND_PENDING).
- Luong hoan tien day du qua cong: voucher REFUND_PENDING trong luc xu ly, yeu cau FAILED khi cong tu choi (SRS 6.2, 6.4);
  quan tri vien hoan don PAYMENT_MISMATCH roi chuyen CANCELLED (SRS 6.3). Bang `payment_refunds` da co.
- Dinh chi thuong hieu (BrandStatus.SUSPENDED, FR-BRAND-09) va cai dat thong bao (`notification_settings`).
- Kiem tra quyen so huu: cac endpoint nhan `:brandId` / `:id` (chien dich, chi nhanh, nhan vien, bao cao,
  doi soat) chua kiem tra ban ghi co thuoc thuong hieu cua nguoi dang nhap (NFR-SEC-03, BR-19, DC-14).
- Kiem tra chuyen trang thai chien dich: submit chi tu DRAFT va thuong hieu da duyet (BR-26),
  approve/reject chi tu PENDING, sua sau khi duyet dua ve PENDING (BR-17).
- Khoa nhap OTP redeem 15 phut sau 5 lan sai (FR-REDEEM-12); danh dau nonce da dung ca khi khong hop le (FR-REDEEM-13).
- Chan vo hieu hoa chi nhanh ap dung cuoi cung cua chien dich con voucher ACTIVE (BR-24).
