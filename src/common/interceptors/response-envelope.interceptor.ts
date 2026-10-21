import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

// Dinh dang phan hoi thong nhat (F01): { data, error, meta }
//  - Thanh cong: data = noi dung tra ve, error = null, meta = thong tin phan trang neu co.
//  - Loi: data = null, error = { code, message, path, timestamp } (xem AllExceptionsFilter).
export interface ApiEnvelope<T = unknown> {
  data: T | null;
  error: {
    code: number;
    message: string;
    // chi co voi loi nghiep vu (BusinessException)
    reason?: string;
    details?: Record<string, unknown> | null;
    path: string;
    timestamp: string;
  } | null;
  meta: PageMeta | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Dung cho endpoint phai tra dung dinh dang cua ben thu ba (vd. IPN cua cong thanh toan)
export const RAW_RESPONSE = 'rawResponse';
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

// Ket qua phan trang chuan: { items, total, page, pageSize } -> meta duoc dien tu dong
function pageMetaOf(body: unknown): PageMeta | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items) || typeof b.total !== 'number' || typeof b.page !== 'number' || typeof b.pageSize !== 'number') {
    return null;
  }
  return { page: b.page, pageSize: b.pageSize, total: b.total, totalPages: Math.max(1, Math.ceil(b.total / b.pageSize)) };
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [context.getHandler(), context.getClass()]);
    if (raw) return next.handle();
    return next.handle().pipe(
      map((body): ApiEnvelope => ({ data: body ?? null, error: null, meta: pageMetaOf(body) })),
    );
  }
}
