import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ReportLocationDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  /** manual override — skips geofence detection */
  @IsOptional() @IsIn(['OFFICE', 'WFH', 'UNKNOWN']) location?: 'OFFICE' | 'WFH' | 'UNKNOWN';
}
