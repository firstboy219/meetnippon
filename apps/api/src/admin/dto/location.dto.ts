import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpsertOfficeLocationDto {
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
  // Bounded like ReportLocationDto — an out-of-range office silently never
  // matches any geofence, which looks like broken WFH detection rather than
  // bad data.
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  // A 0m radius can never match; 100km is already absurd for an office.
  @IsOptional() @IsInt() @Min(10) @Max(100000) geofenceRadiusM?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * A resource's position on a floor plan, stored as a **fraction of the image**
 * (0..1) rather than pixels, so replacing the plan with a different resolution
 * keeps every pin where it was.
 */
export class FloorPlanPinDto {
  @IsString() resourceId!: string;
  @IsNumber() @Min(0) @Max(1) x!: number;
  @IsNumber() @Min(0) @Max(1) y!: number;
}

export class UpsertFloorPlanDto {
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FloorPlanPinDto)
  pins?: FloorPlanPinDto[];
}

export class UpsertBuildingDto {
  @IsString() name!: string;
  @IsOptional() @IsString() officeLocationId?: string;
}

export class UpsertFloorDto {
  @IsString() name!: string;
  @IsString() buildingId!: string;
  @IsOptional() @IsArray() @Type(() => Object) siteContacts?: unknown[];
}
