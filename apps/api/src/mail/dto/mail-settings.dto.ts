import { Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class UpdateMailSettingsDto {
  @IsString() @MinLength(3) @MaxLength(255)
  host!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port?: number;

  @IsOptional() @IsString() @MaxLength(320)
  username?: string;

  /**
   * Omit to keep the stored password; send "" to clear it.
   * Never read back — the API only ever reports whether one is set.
   */
  @IsOptional() @IsString() @MaxLength(512)
  password?: string;

  @IsOptional() @IsString() @MaxLength(120)
  fromName?: string;

  @IsOptional() @IsEmail()
  fromEmail?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
