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

## Trien khai (Render + Neon)

He thong chay that tren cloud, ca nhom khong can cai CSDL hay chay BE tren may moi lam duoc app / web:

| Thanh phan | Noi chay | Dia chi |
|---|---|---|
| BE (repo nay) | Render, goi free, Singapore | https://voucher-platform-api.onrender.com/api (Swagger: /docs, kiem tra: /api/health) |
| CSDL | Neon PostgreSQL (free) | chuoi ket noi chi nam trong bien DATABASE_URL tren Render |
| Web | Vercel | xem README repo Web_FE |
| App | APK build tren GitHub Actions | xem README repo Mobile_App |

Lan dau thiet lap (truong nhom lam mot lan):
1. **Neon** (neon.tech): tao project, region Singapore, database `voucher_platform`. Copy *Connection string* (co `sslmode=require`).
2. Tao bang + du lieu mau len Neon tu may minh:
   ```bash
   DATABASE_URL="<chuoi ket noi Neon>" npm run db:setup
   ```
   Lenh tu bo qua neu CSDL da co bang (khong ghi de du lieu that); `-- --reset` de tao lai tu dau.
3. **Render** (render.com): New -> Blueprint -> chon repo Web_BE. Render doc `render.yaml`, chi hoi `DATABASE_URL`: dan chuoi Neon vao.
   Khoa JWT do Render tu sinh. Moi lan push len `main` Render tu deploy lai.
4. Neu Render cap ten mien khac `voucher-platform-api.onrender.com` thi sua `defaultBackend` trong `lib/config/env.dart` cua Web_FE va Mobile_App.

Luu y goi free: Render tat dich vu sau 15 phut khong co request, lan goi dau tien mat khoang 30-60 giay de khoi dong lai.
Bi mat (DATABASE_URL, JWT) chi dat tren Render, khong commit vao repo. Ai can chay BE tren may thi tao `.env` tu `.env.example`
(dung PostgreSQL / MySQL tren may, hoac xin truong nhom chuoi Neon cua nhanh dev).

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

## Thanh toan payOS (F09)

- Tao don: `POST /api/orders` -> giu cho 15 phut, tra `paymentUrl` (link payOS het han cung luc giu cho).
- Ket qua thanh toan chi duoc cong nhan qua webhook co chu ky: `POST /api/orders/payos-webhook`
  (khai bao URL nay o my.payos.vn -> Kenh thanh toan -> Webhook). App hoi trang thai bang `GET /api/orders/:id`.
- Thanh toan lai trong 15 phut: `POST /api/orders/:id/pay` (tra lai dung link cu).
- Chua co khoa payOS: `paymentUrl` = null; bat `PAYMENT_SIMULATOR=true` va goi `POST /api/orders/:id/simulate-payment`
  (body `{ "success": false }` de thu nhanh that bai). Nho tat o ban that.
- Job 5 phut huy don qua han; webhook den muon, lech tien, giao dich thua deu duoc xu ly va ghi `audit_logs`.

## Thong bao (F16) - cach goi tu tinh nang khac

Inject `NotificationService` (module global, khong can import) roi goi su kien co san; ham khong bao gio nem loi:

```ts
await this.notifications.voucherUsed(userId, voucherItemId, campaignTitle, storeName);   // F11 sau khi redeem thanh cong
await this.notifications.refundResult(userId, refundId, status, message);               // F12 khi co ket qua hoan tien
await this.notifications.campaignPublished(campaign, brandName);                       // F08 khi chien dich chuyen PUBLISHED
await this.notifications.notify(userId, NotificationType.X, { title, body, data, dedupeKey }); // truong hop khac
```

- Goi SAU khi transaction da commit. `dedupeKey` chong gui trung; khach tat nhom thong bao thi tu bo qua.
- Push FCM chay khi co `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`; khong co thi chi luu trong app.
- Job 9:00 (gio VN) nhac voucher het han sau 7 ngay va 1 ngay.

## Dinh dang phan hoi (F01)

Moi API tra ve `{ data, error, meta }` (`src/common/interceptors/response-envelope.interceptor.ts`):

- Thanh cong: `{ "data": <noi dung>, "error": null, "meta": null }`. Danh sach phan trang tra `{ items, total, page, pageSize }` trong `data`,
  `meta` tu dien `{ page, pageSize, total, totalPages }`. Mac dinh 20 / trang, toi da 100 (`src/common/dto/pagination.dto.ts`).
- Loi: `{ "data": null, "error": { "code", "message", "path", "timestamp" }, "meta": null }`; `message` la chuoi tieng Viet hien thang cho nguoi dung.
- Endpoint phai tra dung dinh dang ben thu ba (IPN cong thanh toan) danh dau `@RawResponse()`.
- Endpoint moi chi can `return` du lieu; khong tu boc `{ data }` trong controller.

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
`PAYOS_*` + `PAYMENT_SIMULATOR` (cong thanh toan), `SMTP_*`, `FIREBASE_*`, `REDEEM_TOKEN_TTL_SECONDS`,
`ORDER_RESERVATION_TTL_MINUTES`, `REFUND_WINDOW_DAYS`, `DEFAULT_COMMISSION_RATE`.

## Cac TODO nghiep vu chinh con lai (xem comment trong code)

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

## F02 F03 F04 F05 F14 implementation notes

- Run `npm ci`, `npm run build`, `npm test -- --runInBand`, and `npm run test:e2e`.
- SMTP is required for OTP/activation: configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM and WEB_APP_URL in your environment. Tests replace MailService; they never send real email.
- Existing sessions must sign in again after this update. Access tokens now reference a database session; refresh tokens rotate and only their SHA-256 hashes are stored.
- Staff: GET /api/redeem/my-stores, then POST /api/auth/select-store with storeId before POST /api/redeem. The server enforces the store associated with the session.
- Activation: POST /api/auth/activation/request with email, then POST /api/auth/activate with email, token and password. Tokens last 24 hours and are single-use.
- Search: GET /api/vouchers supports categoryId, keyword (campaign/brand name), minPrice/maxPrice, minDiscount/maxDiscount (percent), sort, lat/lng, radiusKm (1/3/5/10), locationDenied, page and pageSize (up to 100). distance_asc sorts by the nearest active applicable store. Location filters are evaluated before pagination.
- GET /api/vouchers/:id accepts lat/lng and returns active applicable stores, availableQuantity, canPurchase, refundPolicy and up to 20 visible reviews plus full review count/average. Only PUBLISHED/SOLD_OUT campaigns in their sale window are public; brand bank details are omitted.
- Reports: GET /api/brands/:brandId/report supports campaignId, storeId, from and to. Only the brand owner can read it. Sales cohorts are filtered by Order.paidAt; store filters refer to the redemption location, since purchases do not have a store. Date-only inputs cover whole Vietnam calendar days. Revenue subtracts completed voucher refunds; usage rate uses sold vouchers excluding refunded vouchers.
- GET /api/admin/dashboard returns transactionsByDay in Vietnam time and commission at the rates captured on paid orders, excluding refunded vouchers.
- Queues: GET /api/refunds/manual-pending and GET /api/admin/payment-mismatches. After completing a refund outside the system, PATCH /api/refunds/:id/confirm-manual or PATCH /api/admin/payment-mismatches/:id/confirm-refund with gatewayRefundId. These actions record an existing external refund; they do not transfer money. Confirmations lock records, record PaymentRefund and AuditLog, and reject repeats.
- No database schema migration is needed: this update uses existing session, OTP, refund and audit tables. Unit/e2e tests run against pg-mem; validate database locking and delivery with PostgreSQL/MySQL and configured SMTP before deployment.
