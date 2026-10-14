# Cơ sở dữ liệu – PostgreSQL hoặc MySQL

Web_BE chạy được trên **PostgreSQL 13+** (mặc định, đúng theo SRS) hoặc **MySQL 8.0+**. Chọn hệ bằng biến `DB_TYPE` trong `.env`.

```
database/
  postgres/schema.sql   # tạo 20 bảng, enum, khóa ngoại (PostgreSQL)
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
| Chủ thương hiệu | `owner@phuclong.local` | Phúc Long, hồ sơ đang chờ duyệt |
| Nhân viên cửa hàng | `staff@highlands.local` | Được gán 2 chi nhánh Lê Lợi và Nguyễn Huệ |
| Khách hàng | `khach@voucher.local` | Đăng nhập bằng OTP, đã có 1 voucher ACTIVE (mã `HL-SEED-0001`) |

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

- **PostgreSQL:** chạy toàn bộ `schema.sql` và `seed.sql` trên pg-mem (PostgreSQL giả lập). Khóa ngoại được kiểm tra thật.
- **MySQL:** đã kiểm tra cú pháp toàn bộ câu lệnh; TypeORM dựng được metadata cho MySQL.
- **Chưa chạy trên server MySQL thật.** Người đầu tiên dùng MySQL hãy chạy thử rồi báo lại cho nhóm.
