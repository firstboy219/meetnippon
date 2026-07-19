import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  Matches,
  ArrayUnique,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BusinessHoursDto {
  @Matches(HHMM, { message: 'start must be HH:mm' })
  start!: string;

  @Matches(HHMM, { message: 'end must be HH:mm' })
  end!: string;

  @IsArray()
  @IsInt({ each: true })
  @ArrayUnique()
  days!: number[];
}

/** All optional — only provided keys override the broader scope. */
export class RulesDto {
  @IsOptional() @IsInt() @Min(1) minDurationMinutes?: number;
  @IsOptional() @IsInt() @Min(1) maxDurationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) minAdvanceMinutes?: number;
  @IsOptional() @IsInt() @Min(0) maxAdvanceDays?: number;
  @IsOptional() @IsInt() @Min(0) bufferMinutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDto)
  businessHours?: BusinessHoursDto;

  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) approverIds?: string[];
  @IsOptional() @IsInt() @Min(0) maxBookingsPerUserPerDay?: number;
  @IsOptional() @IsBoolean() allowExternalParticipants?: boolean;
  @IsOptional() @IsBoolean() allowRecurring?: boolean;
  @IsOptional() @IsBoolean() checkInRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) autoReleaseMinutes?: number;
}

export class UpsertPolicyDto {
  @IsIn(['TENANT', 'CATEGORY', 'ROOM'])
  scope!: 'TENANT' | 'CATEGORY' | 'ROOM';

  /** required when scope=CATEGORY */
  @IsOptional() @IsString() category?: string;

  /** required when scope=ROOM */
  @IsOptional() @IsString() resourceId?: string;

  @ValidateNested()
  @Type(() => RulesDto)
  rules!: RulesDto;
}
