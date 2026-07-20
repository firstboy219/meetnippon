import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ParticipantDto {
  @IsOptional() @IsString() userId?: string;
  @IsString() email!: string;
  @IsOptional() @IsBoolean() external?: boolean;
}

export class RecurrenceDto {
  @IsIn(['DAILY', 'WEEKLY'])
  freq!: 'DAILY' | 'WEEKLY';

  /** total occurrences including the first (2..52) */
  @IsInt() @Min(2) @Max(52)
  count!: number;
}

export class CreateBookingDto {
  @IsString()
  title!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsIn(['OFFLINE', 'ONLINE', 'HYBRID'])
  type?: 'OFFLINE' | 'ONLINE' | 'HYBRID';

  @IsOptional() @IsString()
  meetingLink?: string;

  /** required for OFFLINE/HYBRID; omitted for pure ONLINE */
  @IsOptional() @IsString()
  resourceId?: string;

  /** book on behalf of another user (delegate); defaults to the caller */
  @IsOptional() @IsString()
  principalId?: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants?: ParticipantDto[];

  /**
   * Whether to tell the participants. Defaults to true — the surprising
   * outcome is a silent invite, so silence has to be asked for explicitly.
   */
  @IsOptional() @IsBoolean()
  notify?: boolean;

  @IsOptional() @IsArray()
  reminders?: unknown[];

  @IsOptional() @IsBoolean()
  recordingRequested?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}
