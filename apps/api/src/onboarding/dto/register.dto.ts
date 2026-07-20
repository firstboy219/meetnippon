import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterWorkspaceDto {
  @IsString() @MinLength(2) @MaxLength(80) orgName!: string;
  /** desired workspace slug/subdomain — validated [a-z0-9-], 3–30, not reserved */
  @IsString() slug!: string;
  @IsString() @MinLength(2) @MaxLength(80) adminFullName!: string;
  @IsEmail() adminEmail!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  /** Optional IANA zone; defaults to Asia/Jakarta. */
  @IsOptional() @IsString() timezone?: string;
}
