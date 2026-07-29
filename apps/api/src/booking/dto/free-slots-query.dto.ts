import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class FreeSlotsQueryDto {
  @IsString()
  resourceId!: string;

  /** Calendar date on the tenant's clock. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day must be YYYY-MM-DD' })
  day!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

export class FreeWindowsQueryDto {
  @IsString()
  resourceId!: string;

  /** Calendar date on the tenant's clock. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day must be YYYY-MM-DD' })
  day!: string;

  /** Editing this booking: its own current slot must not count as busy. */
  @IsOptional()
  @IsString()
  excludeBookingId?: string;
}
