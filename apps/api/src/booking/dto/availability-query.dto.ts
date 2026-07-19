import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class AvailabilityQueryDto {
  @IsString()
  resourceId!: string;

  /** inclusive window start (ISO); defaults to now */
  @IsOptional() @IsISO8601()
  from?: string;

  /** exclusive window end (ISO); defaults to from + 24h */
  @IsOptional() @IsISO8601()
  to?: string;
}
