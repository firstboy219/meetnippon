import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Required only in shared-URL mode, when the host does not identify a tenant. */
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
