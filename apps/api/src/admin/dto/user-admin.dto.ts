import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
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
