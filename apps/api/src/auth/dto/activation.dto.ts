import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestActivationDto {
  @IsEmail()
  email!: string;

  /** Needed on shared-URL hosts where the tenant is not in the hostname. */
  @IsOptional() @IsString() @MaxLength(64)
  tenantSlug?: string;
}

export class CompleteActivationDto {
  @IsString() @MaxLength(512)
  token!: string;

  @IsString() @MinLength(8) @MaxLength(128)
  newPassword!: string;
}
