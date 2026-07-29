import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { ParticipantDto } from './create-booking.dto';

/**
 * Edits an existing booking. Every field is optional; only what is sent is
 * changed. Times must be sent as a pair — moving one edge alone is almost
 * always a mistake, and validating a half-updated slot would be meaningless.
 */
export class UpdateBookingDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['OFFLINE', 'ONLINE', 'HYBRID']) type?: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  @IsOptional() @IsString() meetingLink?: string;
  @IsOptional() @IsISO8601() startTime?: string;
  @IsOptional() @IsISO8601() endTime?: string;
  @IsOptional() @IsString() resourceId?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ParticipantDto)
  participants?: ParticipantDto[];

  /** Whether to tell participants the meeting moved. Defaults to true. */
  @IsOptional() @IsBoolean()
  notify?: boolean;
}
