import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertOfficeLocationDto {
  @IsString() name!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsInt() @Min(0) geofenceRadiusM?: number;
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
