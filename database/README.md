# Cơ sở dữ liệu – PostgreSQL hoặc MySQL

Web_BE chạy được trên **PostgreSQL 13+** (mặc định, đúng theo SRS) hoặc **MySQL 8.0+**. Chọn hệ bằng biến `DB_TYPE` trong `.env`.

```
database/
  postgres/schema.sql   # tạo 25 bảng (SRS 7.1), enum, khóa ngoại (PostgreSQL)
  postgres/seed.sql     # dữ liệu mẫu
  mysql/schema.sql      # như trên cho MySQL (utf8mb4, InnoDB)
  mysql/seed.sql
  generate-schema.ts    # sinh schema.sql từ entity TypeORM
  generate-seed.ts      # sinh seed.sql cho cả hai hệ
```

> Hai file `schema.sql` được **sinh tự động từ entity** nên luôn khớp với code. Không sửa tay.
> Sửa entity xong thì chạy `npm run db:schema` rồi commit cả file `.sql` mới.

## Cách 1 – PostgreSQL (mặc định)

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U postgres -d voucher_platform < database/postgres/schema.sql
docker compose exec -T postgres psql -U postgres -d voucher_platform < database/postgres/seed.sql
```

Nếu cài PostgreSQL trực tiếp (không dùng Docker): tạo database `voucher_platform` bằng pgAdmin, rồi chạy hai file trên bằng Query Tool hoặc `psql`.

`.env`:
```
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=voucher_platform
```

## Cách 2 – MySQL

```bash
docker compose --profile mysql up -d mysql
docker compose exec -T mysql mysql -uroot -proot voucher_platform < database/mysql/schema.sql
docker compose exec -T mysql mysql -uroot -proot voucher_platform < database/mysql/seed.sql
```

Nếu dùng MySQL Workbench hoặc XAMPP (MySQL 8):
1. Tạo database:
   ```sql
   CREATE DATABASE voucher_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Mở rồi chạy lần lượt `mysql/schema.sql` và `mysql/seed.sql`.

> XAMPP đời cũ dùng MariaDB thay vì MySQL 8 và chưa được kiểm thử.

`.env`:
```
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=root
DB_NAME=voucher_platform
```

## Tài khoản mẫu (seed)

Mật khẩu các tài khoản web: **`Voucher@123`**. Chỉ dùng khi phát triển. Đổi bằng biến `SEED_PASSWORD` rồi chạy `npm run db:seed-sql`.

| Vai trò | Email | Ghi chú |
|---|---|---|
| Quản trị viên | `admin@voucher.local` | |
| Chủ thương hiệu | `owner@highlands.local` | Highlands Coffee (đã duyệt), 2 chi nhánh, 3 chiến dịch (đang bán / nháp / chờ duyệt) |
| Chủ thương hiệu | `owner@phuclong.local` | Phúc Long (đã duyệt), 3 chi nhánh, 3 chiến dịch (đang bán / hết hàng / sắp kết thúc bán) |
| Chủ thương hiệu | `owner@pizza4ps.local` | Pizza 4P's (đã duyệt), 2 chi nhánh, 3 chiến dịch (đang bán / `SOLD_OUT` / sắp hết hạn dùng) |
| Chủ thương hiệu | `owner@guardian.local` | Guardian (đã duyệt), 3 chi nhánh, 3 chiến dịch (đang bán / tạm dừng / đã kết thúc) |
| Chủ thương hiệu | `owner@cgv.local` | CGV Cinemas (đã duyệt), 2 chi nhánh, 3 chiến dịch (đang bán / chờ duyệt / đã duyệt chưa tới ngày bán) |
| Chủ thương hiệu | `owner@circlek.local` | Circle K, **hồ sơ đang chờ duyệt** — dùng để demo duyệt / từ chối thương hiệu |
| Nhân viên cửa hàng | `staff@highlands.local` | Được gán 2 chi nhánh Lê Lợi và Nguyễn Huệ |
| Nhân viên cửa hàng | `staff@phuclong.local` | 2 chi nhánh Lê Văn Sỹ và Phan Xích Long |
| Nhân viên cửa hàng | `staff@pizza4ps.local` | Chi nhánh Lê Thánh Tôn |
| Nhân viên cửa hàng | `staff@guardian.local` | Chi nhánh Nguyễn Trãi |
| Nhân viên cửa hàng | `staff@cgv.local` | Chi nhánh Vincom Đồng Khởi |
| Khách hàng | `khach@voucher.local` | Đăng nhập bằng OTP, đã có 1 voucher ACTIVE (mã `HL-SEED-0001`) |

Tổng cộng: **5 danh mục**, **5 thương hiệu đã duyệt** + 1 chờ duyệt, **14 chi nhánh** có tọa độ thật ở TP.HCM
và Hà Nội, **15 chiến dịch** đủ ba loại `DISCOUNT` / `PREPAID` / `COMBO`.

### Mốc thời gian của dữ liệu demo

Dữ liệu demo (4 thương hiệu ngoài Highlands, 12 chiến dịch) dùng **mốc ngày tương đối tính từ lúc sinh seed**,
nên chạy lại `npm run db:seed-sql` là dữ liệu luôn còn trong thời gian bán — màn Home không bao giờ trống.
Riêng khối Highlands + đơn hàng mẫu + voucher `HL-SEED-0001` giữ **ngày cố định**, vì `npm run test:e2e` chốt
đối soát theo một kỳ cố định; đổi khối này sang ngày tương đối sẽ làm test vỡ dần theo thời gian.

Một số ca đã seed sẵn để demo:

| Ca | Ở đâu |
|---|---|
| Hết hàng nhưng vẫn hiện trên app | *Giảm 30% toàn bộ menu trà* (Phúc Long) — `PUBLISHED`, tồn kho khả dụng = 0 |
| `SOLD_OUT` thật (chỉ thấy ở portal) | *Combo 2 pizza cỡ M kèm 2 nước ép* (Pizza 4P's) |
| Sắp kết thúc bán (còn 3 ngày) | *Phiếu 200.000đ dùng tại Phúc Long* |
| Hạn dùng đúng bằng kết thúc bán + 10 ngày (ca biên DC-10) | *Giảm 100.000đ cho hóa đơn từ 500.000đ* (Pizza 4P's) |
| Đã kết thúc bán, voucher đã bán vẫn còn hạn (BR-15) | *Combo sữa rửa mặt và kem chống nắng* (Guardian) |
| Tạm dừng bán | *Giảm 25% sản phẩm chăm sóc da* (Guardian) |
| Nằm ở hàng chờ duyệt của quản trị viên | *Giảm 40% vé xem phim ngày thường* (CGV) |
| Đã duyệt, chưa tới ngày bán (chờ job `FR-CAMP-10`) | *Phiếu bắp nước 100.000đ* (CGV) |

Ảnh chiến dịch và logo thương hiệu hiện để trống — app tự hiện ô xám thay thế. Sẽ bổ sung khi có chức năng
tải ảnh hoặc khi triển khai cơ sở dữ liệu thật.

`generate-seed.ts` **tự kiểm tra ràng buộc trước khi ghi file**: DC-03, DC-05, DC-07, DC-10 / BR-21, DC-14 và
FR-CAMP-12. Seed sai ràng buộc thì lệnh dừng với mã lỗi, không sinh ra file `.sql` hỏng.

Các id cố định (dạng `11111111-…`, `22222222-…`) nằm trong `generate-seed.ts`, dùng khi test bằng Swagger hoặc Postman.

## Khác biệt giữa hai hệ (đã xử lý trong code)

| Nội dung | PostgreSQL | MySQL |
|---|---|---|
| Thời gian | `timestamptz` | `datetime`; driver đặt `timezone: 'Z'` nên vẫn lưu theo UTC |
| Số thực | `double precision` | `double` |
| JSON | `jsonb` | `json` |
| Khóa chính uuid | `gen_random_uuid()` sinh trong DB | `varchar(36)`, TypeORM tự sinh uuid |
| Tìm kiếm không phân biệt hoa thường | `LOWER(...) LIKE` (không dùng `ILIKE`) | như bên trái |

Quy ước khi viết truy vấn mới để giữ chạy được trên cả hai hệ:
- Dùng kiểu cột trong `src/config/db-types.ts`, không ghi thẳng `timestamptz`, `jsonb`.
- Dùng QueryBuilder với tên thuộc tính (`c.brandId`), không viết SQL thô có tên cột bọc trong `"..."` hay `` `...` ``.
- Không dùng hàm riêng của một hệ: `ILIKE`, `::`, `NOW() AT TIME ZONE`, `IFNULL`… Tính thời gian bằng tham số truyền từ code.

## Kiểm thử đã làm

- **PostgreSQL:** `npm run test:e2e` nạp `schema.sql` + `seed.sql` vào pg-mem (PostgreSQL giả lập), khởi động toàn bộ API rồi chạy 10 kịch bản: đăng nhập, phân quyền, tạo / duyệt chiến dịch, tìm kiếm, ví, xác nhận sử dụng bằng OTP, đối soát, đánh giá. Khóa ngoại được kiểm tra thật.
- **MySQL:** đã kiểm tra cú pháp toàn bộ câu lệnh; TypeORM dựng được metadata cho MySQL.
- **Chưa chạy trên server MySQL thật.** Người đầu tiên dùng MySQL hãy chạy thử rồi báo lại cho nhóm.
