import { IsEmail, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateExternalTaskDto {
  @IsString() category!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() requesterName?: string;
  @IsOptional() @IsString() sourcePlatform?: string;
  @IsEmail() approverEmail!: string;
  @IsOptional() @IsUrl({ require_tld: false }) callbackUrl?: string;
}

export class DecideExternalTaskDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}
