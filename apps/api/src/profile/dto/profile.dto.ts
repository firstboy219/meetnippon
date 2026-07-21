import {
  IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  fullName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  department?: string;

  @IsOptional() @IsIn(['EN', 'ID'])
  languagePref?: 'EN' | 'ID';

  /** Relative URL produced by /uploads; '' clears the picture. */
  @IsOptional() @IsString() @MaxLength(512)
  avatarUrl?: string;

  /**
   * Contact address only. Not a login and not a recovery channel — nothing
   * verifies that the user owns it.
   */
  @IsOptional() @IsEmail() @MaxLength(320)
  personalEmail?: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1)
  currentPassword!: string;

  // Matches the minimum the registration flow enforces.
  @IsString() @MinLength(8) @MaxLength(128)
  newPassword!: string;
}
