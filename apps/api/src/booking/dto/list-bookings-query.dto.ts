import { IsIn, IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const BOOKING_SCOPES = ['upcoming', 'past', 'all'] as const;
export type BookingScope = (typeof BOOKING_SCOPES)[number];

export const BOOKING_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
  'WAITLIST',
] as const;

export class ListBookingsQueryDto {
  /**
   * Which side of "now" to return. The boundary is endTime, not startTime, so a
   * meeting that is running right now still counts as upcoming.
   * Omitted means every booking, which is what this endpoint always did.
   */
  @IsOptional() @IsIn(BOOKING_SCOPES as unknown as string[])
  scope?: BookingScope;

  /** inclusive lower bound on startTime (ISO instant) */
  @IsOptional() @IsISO8601()
  from?: string;

  /** exclusive upper bound on startTime (ISO instant) */
  @IsOptional() @IsISO8601()
  to?: string;

  @IsOptional() @IsIn(BOOKING_STATUSES as unknown as string[])
  status?: string;

  /**
   * Page size. Callers that paginate ask for one row more than they render and
   * use the surplus to decide whether a "load more" control belongs on screen —
   * that keeps the response a plain array, as it has always been.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  take?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  skip?: number;
}
