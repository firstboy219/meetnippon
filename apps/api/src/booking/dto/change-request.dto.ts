import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChangeRequestDto {
  @IsOptional() @IsISO8601()
  proposedStartTime?: string;

  @IsOptional() @IsISO8601()
  proposedEndTime?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class DecideChangeRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
