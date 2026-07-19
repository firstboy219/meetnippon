import { IsHexColor, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() loginBgUrl?: string;
  @IsOptional() @IsIn(['SUBDOMAIN', 'SHARED_URL']) accessMode?: 'SUBDOMAIN' | 'SHARED_URL';
  @IsOptional() @IsString() subdomain?: string;
}
