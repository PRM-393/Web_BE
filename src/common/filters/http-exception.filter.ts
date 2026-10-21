import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Chuan hoa loi tra ve theo dinh dang { data, error, meta } (F01), khong ro ri thong tin ky thuat - NFR-USA-02.
// error.message luon la chuoi de hien thang cho nguoi dung; loi validation nhieu dong duoc noi bang xuong dong.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? messageOf(exception.getResponse())
        : 'Da co loi xay ra, vui long thu lai sau.';

    response.status(status).json({
      data: null,
      error: {
        code: status,
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
      meta: null,
    });
  }
}

function messageOf(body: string | object): string {
  if (typeof body === 'string') return body;
  const m = (body as { message?: unknown }).message;
  if (Array.isArray(m)) return m.join('\n');
  if (typeof m === 'string') return m;
  return 'Yeu cau khong hop le.';
}
