# Kịch bản demo luồng sử dụng voucher (F10 – F11 – F12 – F15)

Dùng cho buổi demo giữa kỳ / bảo vệ. Thời lượng khoảng 6 phút.

## Chuẩn bị (trước giờ demo 15 phút)

| Thiết bị | Vai trò | Mở sẵn |
|---|---|---|
| Điện thoại 1 (Android, cài APK) | Khách hàng | App, đã đăng nhập `khach@voucher.local` (OTP gửi về email) |
| Điện thoại 2 hoặc laptop có camera | Nhân viên cửa hàng | Web cửa hàng (bản Vercel, HTTPS để trình duyệt cho dùng camera), đăng nhập `staff@pizza4ps.local` / `Voucher@123` |
| Laptop chiếu màn hình | Quản trị viên | Web quản trị, đăng nhập `admin@voucher.local` / `Voucher@123` |

- `staff@pizza4ps.local` chỉ được gán **1 chi nhánh** (Pizza 4P's Lê Thánh Tôn), nên web tự chọn chi nhánh làm việc.
- Gọi `https://voucher-platform-api.onrender.com/api/health` trước 1–2 phút để đánh thức Render (gói miễn phí ngủ sau 15 phút).
- Khách mua sẵn **3 voucher Pizza 4P's** và **1 voucher Highlands** (thanh toán giả lập), để kịch bản 4 có voucher sai chi nhánh.
- Chạy ở máy cá nhân, không cần SMTP: `npx ts-node -T test/helpers/serve-memory.ts 3000` (Web_BE). Mã OTP của khách nằm trong file `Web_BE/.e2e-mail.json`.

## Các bước

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Khách mở **Ví voucher** → tab "Đang hiệu lực" → chạm voucher Pizza → **Sử dụng ngay** | Hiện mã QR, mã OTP 6 số và đồng hồ đếm ngược 60 giây; màn hình không tắt. Hết 60 giây mã tự làm mới. |
| 2 | Nhân viên chọn tab **Quét QR**, nhập giá trị hóa đơn, quét mã trên điện thoại khách | Màn **xanh "HỢP LỆ"** (tên voucher, mã tra cứu, giờ). Trong vòng 5 giây, điện thoại khách hiện "Voucher đã được sử dụng"; khách nhận thông báo. |
| 3 | Nhân viên quét lại đúng mã đó | Màn **đỏ "ĐÃ SỬ DỤNG"**: "Đã dùng lúc … tại Pizza 4P's Lê Thánh Tôn". |
| 4 | Khách mở mã của voucher **Highlands**, nhân viên Pizza quét | Màn **đỏ "SAI CHI NHÁNH"** kèm danh sách chi nhánh Highlands áp dụng. Mã này đã bị tiêu, khách phải tạo mã mới. |
| 5 | Khách mở voucher Pizza thứ 2, đọc **OTP**; nhân viên chuyển sang tab **Nhập OTP** và nhập mã | Hợp lệ. (Tùy chọn) nhập sai OTP 5 lần thì ô OTP bị khóa 15 phút, quét QR vẫn được. |
| 6 | Nhân viên mở **Lịch sử trong ngày** → **Sửa hóa đơn** ở lượt vừa xác nhận | Sửa được trong 10 phút sau khi xác nhận. |
| 7 | Tắt mạng điện thoại khách → mở **Ví voucher** | Vẫn xem được ví (dữ liệu SQLite), có banner "Mất kết nối"; nút **Sử dụng ngay** bị ẩn kèm lý do "Cần kết nối mạng…". Bật lại mạng. |
| 8 | Khách mở voucher Pizza thứ 3 → **Yêu cầu hoàn tiền** | Thấy hạn chót hoàn. Gửi yêu cầu → "Hoàn tiền thành công", voucher chuyển sang tab "Đã hoàn". Voucher đã dùng thì nút hoàn bị khóa kèm lý do. |
| 9 | (Hoàn thủ công) Đặt `REFUND_MODE=manual` rồi gửi thêm một yêu cầu; quản trị viên mở **Hoàn tiền** → nhập mã giao dịch → **Đã hoàn tiền** | Yêu cầu chuyển "Hoàn tiền thành công"; app khách thấy trạng thái mới trong **Yêu cầu hoàn tiền**. |
| 10 | Khách mở chi tiết chiến dịch Pizza → **Viết đánh giá** (4 sao) | Đánh giá hiện cùng điểm trung bình. Khách chưa dùng voucher thì không thấy nút. Quản trị viên **Ẩn** đánh giá thì điểm trung bình được tính lại. |

## Sự cố thường gặp

- **Web không mở được camera**: phải chạy qua HTTPS (bản Vercel) hoặc `localhost`, và cho phép trình duyệt dùng camera. Nếu vẫn không được thì dùng OTP.
- **"Vui lòng chọn chi nhánh làm việc"**: đăng xuất rồi đăng nhập lại web cửa hàng để chọn lại chi nhánh.
- **"Bạn đã tạo mã 10 lần trong 10 phút"**: mỗi khách chỉ được tạo tối đa 10 mã trong 10 phút. Đợi đến giờ được ghi trong thông báo, hoặc demo bằng tài khoản khách khác.
