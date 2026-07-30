import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ParticipantDto } from '../dto/create-booking.dto';

export class ChangeRequestDraftDto {
  @IsString() @MaxLength(150)
  title!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsIn(['OFFLINE', 'ONLINE', 'HYBRID'])
  type?: 'OFFLINE' | 'ONLINE' | 'HYBRID';

  @IsOptional() @IsString()
  meetingLink?: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants?: ParticipantDto[];

  @IsOptional() @IsBoolean()
  notify?: boolean;
}

export class CreateChangeRequestDto {
  /** The slice of the existing booking's time being requested. */
  @IsISO8601()
  requestedStartTime!: string;

  @IsISO8601()
  requestedEndTime!: string;

  @ValidateNested()
  @Type(() => ChangeRequestDraftDto)
  draft!: ChangeRequestDraftDto;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class DecideChangeRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Required when approving: the author's new time for their own booking. */
  @IsOptional() @IsISO8601()
  ownerNewStartTime?: string;

  @IsOptional() @IsISO8601()
  ownerNewEndTime?: string;
}
