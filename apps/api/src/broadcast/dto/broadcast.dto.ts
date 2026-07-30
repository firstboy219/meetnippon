import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

export class BroadcastRecipientsQueryDto extends PageQueryDto {
  /** Matches name or email. */
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE']) role?: string;
  @IsOptional() @IsIn(['true', 'false']) isActive?: string;
  /** 'false' = never set a password yet (self-service or admin-created, still pending). */
  @IsOptional() @IsIn(['true', 'false']) hasPassword?: string;
}

export class BroadcastFilterDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE']) role?: string;
  @IsOptional() @IsIn(['true', 'false']) isActive?: string;
  @IsOptional() @IsIn(['true', 'false']) hasPassword?: string;
}

/**
 * Either an explicit pick from the recipient picker (SELECTED — the
 * checkboxes the admin actually ticked) or every current-and-future row that
 * matches a filter at send time (ALL_MATCHING — "everyone like this", not
 * capped to whatever page the picker happened to be showing).
 */
export class SendToDto {
  @IsIn(['ALL_MATCHING', 'SELECTED'])
  mode!: 'ALL_MATCHING' | 'SELECTED';

  @IsOptional() @ValidateNested() @Type(() => BroadcastFilterDto)
  filter?: BroadcastFilterDto;

  @IsOptional() @IsArray() @IsString({ each: true })
  userIds?: string[];
}

export class ResendActivationDto extends SendToDto {}

export class SendAnnouncementDto extends SendToDto {
  @IsString() @MaxLength(150)
  subject!: string;

  /** Rich HTML from the composer's editor — sanitized server-side before
   *  it ever reaches an email template or the database. Markup adds
   *  overhead over plain text, hence the taller cap than a plain message. */
  @IsString() @MinLength(1) @MaxLength(20000)
  messageHtml!: string;
}

export class PreviewAnnouncementDto {
  @IsString() @MaxLength(150)
  subject!: string;

  @IsString() @MaxLength(20000)
  messageHtml!: string;
}
