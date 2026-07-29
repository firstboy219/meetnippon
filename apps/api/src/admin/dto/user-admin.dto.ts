import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE']) role?: 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsIn(['EN', 'ID']) languagePref?: 'EN' | 'ID';
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE']) role?: 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsIn(['EN', 'ID']) languagePref?: 'EN' | 'ID';
}

export class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(8) password!: string;
}

/** Admin fills in the details the sign-up attempt could not carry. */
export class ApproveRegistrationDto {
  @IsString() @MaxLength(200) fullName!: string;
  @IsOptional() @IsString() @MaxLength(200) department?: string;
  @IsOptional() @IsIn(['ADMIN', 'APPROVER', 'EMPLOYEE']) role?: 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
}

export class RejectRegistrationDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** One CSV row: the template is deliberately just name, email, position. */
export class ImportUserRowDto {
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(200) department?: string;
}

export class ImportUsersDto {
  @IsArray()
  // Headroom well above any realistic single-file roster; the real ceiling in
  // practice is the request body limit set alongside this in main.ts.
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportUserRowDto)
  rows!: ImportUserRowDto[];

  /**
   * Email each imported person their activation link. Off lets an admin stage
   * a roster first and invite later.
   */
  @IsOptional() @IsBoolean() sendInvites?: boolean;
}
