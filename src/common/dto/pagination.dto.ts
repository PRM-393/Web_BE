import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// F01: phan trang mac dinh 20 / trang, toi da 100. Endpoint danh sach ke thua DTO nay va tra ve
// { items, total, page, pageSize } -> ResponseEnvelopeInterceptor tu dien meta.
export class PaginationQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toPage<T>([items, total]: [T[], number], q: PaginationQueryDto): Paginated<T> {
  return { items, total, page: q.page ?? 1, pageSize: q.pageSize ?? 20 };
}

export function skipTake(q: PaginationQueryDto) {
  const page = q.page ?? 1, pageSize = q.pageSize ?? 20;
  return { skip: (page - 1) * pageSize, take: pageSize };
}
