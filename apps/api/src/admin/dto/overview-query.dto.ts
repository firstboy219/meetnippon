import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

export class AuditQueryDto extends PageQueryDto {
  /** Substring match on the action, e.g. "booking." or "mail.settings". */
  @IsOptional() @IsString() @MaxLength(120)
  action?: string;

  @IsOptional() @IsString() @MaxLength(120)
  entity?: string;

  @IsOptional() @IsString() @MaxLength(64)
  actorId?: string;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;
}

export class AdminBookingsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'WAITLIST'])
  status?: string;

  /** Matches the booking title. */
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;

  /** 'true' narrows to bookings whose room went unused (no check-in). */
  @IsOptional() @IsIn(['true'])
  noShow?: string;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;
}

export class UserListQueryDto extends PageQueryDto {
  /** Matches name or email. */
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;

  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE'])
  role?: string;

  @IsOptional() @IsIn(['true', 'false'])
  isActive?: string;
}
