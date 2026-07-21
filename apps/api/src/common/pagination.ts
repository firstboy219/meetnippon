import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Page-based paging for admin lists.
 *
 * These lists were previously truncated with a bare `take` (audit at 100,
 * bookings at 200) — everything older simply could not be reached, silently.
 * A total is returned alongside the rows because an admin needs to know how
 * much there is, not just what fits on screen.
 */
export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Total pages, at least 1 so the UI never renders "page 1 of 0". */
  pages: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Normalised skip/take for a query, with sane bounds already applied. */
export function pageParams(q: PageQueryDto): { skip: number; take: number; page: number; pageSize: number } {
  const pageSize = Math.min(Math.max(q.pageSize ?? DEFAULT_PAGE_SIZE, 1), 200);
  const page = Math.max(q.page ?? 1, 1);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
