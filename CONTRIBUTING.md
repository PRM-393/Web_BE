# Quy ước làm việc (PRM393)

## Nhánh
- `main` luôn chạy được và deploy được. Không push thẳng lên `main`.
- Tên nhánh: `<loai>/<MaTask>-<mo-ta-ngan>_<Ten>`, ví dụ `feature/F09-order-payment_Viet`, `fix/F11-redeem-qr_Dat`.
- `<loai>`: `feature`, `fix`, `chore`, `docs`, `test`. `<MaTask>` lấy từ file phân công (F01…F18, QL).
- Tạo nhánh từ `main` mới nhất: `git switch main && git pull && git switch -c feature/F10-wallet_Xuan`.
- Nhánh phụ thuộc nhánh khác chưa merge (stacked) thì ghi rõ trong PR và merge theo thứ tự.

## Commit
- Commit nhỏ, mỗi commit là một bước hoàn chỉnh (code biên dịch được, test chạy được).
- Dạng: `<loai>(<MaTask>): <mo ta>`, ví dụ `feat(F09): reserve stock when creating order`, `test(F16): notification provider tests`.
- `<loai>`: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Không commit `.env`, key, mật khẩu. Secret chỉ đặt trên Render / GitHub Secrets.

## Pull request
1. Rebase hoặc merge `main` mới nhất, chạy test và lint trước khi mở PR.
2. Mở PR vào `main`, điền template, gắn mã task.
3. Cần ít nhất 1 người review (leader: Việt). Sửa theo góp ý bằng commit mới, không force-push khi đang review.
4. CI xanh mới merge. Chọn "Squash and merge" nếu nhánh nhiều commit lặt vặt, ngược lại "Create a merge commit".
5. Merge xong xoá nhánh.

## Lệnh kiểm tra
- BE: `npm run lint && npm test && npm run test:e2e`
- FE / Mobile: `flutter analyze && flutter test`

## Định dạng API (F01)
- Mọi response: `{ data, error, meta }`. Danh sách phân trang mặc định `pageSize = 20`.
- Lỗi: `{ data: null, error: { code, message, path, timestamp }, meta: null }`.
