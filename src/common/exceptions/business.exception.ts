import { HttpException, HttpStatus } from '@nestjs/common';

// Loi nghiep vu co ma ly do (reason) va du lieu kem theo (details) de client hien thong bao cu the,
// vd. redeem that bai vi "da dung luc ... tai ...", "sai chi nhanh" kem danh sach chi nhanh ap dung.
// AllExceptionsFilter dua reason / details vao error cua dinh dang { data, error, meta } (F01).
export class BusinessException extends HttpException {
  constructor(
    readonly reason: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, reason, details }, status);
  }
}
