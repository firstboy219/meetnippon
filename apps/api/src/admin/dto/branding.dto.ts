import { IsHexColor, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() loginBgUrl?: string;
  @IsOptional() @IsIn(['SUBDOMAIN', 'SHARED_URL']) accessMode?: 'SUBDOMAIN' | 'SHARED_URL';
  @IsOptional() @IsString() subdomain?: string;
  /** IANA zone, e.g. "Asia/Jakarta". Validated against Intl before saving. */
  @IsOptional() @IsString() timezone?: string;

  /** How many days a sign-in lasts before the password is asked for again. */
  @IsOptional() @IsInt() @Min(1) @Max(365) sessionDays?: number;
  /** Access-token lifetime; the portal renews it silently while in use. */
  @IsOptional() @IsInt() @Min(5) @Max(1440) accessTtlMinutes?: number;
}
