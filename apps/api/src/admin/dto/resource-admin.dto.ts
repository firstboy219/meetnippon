import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateResourceDto {
  @IsIn(['ROOM', 'DESK']) type!: 'ROOM' | 'DESK';
  @IsString() name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) facilities?: string[];
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() floorId?: string;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) facilities?: string[];
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsString() floorId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']) status?: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
}
