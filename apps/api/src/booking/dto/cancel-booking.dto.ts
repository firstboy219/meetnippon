import { IsOptional, IsString } from 'class-validator';

export class CancelBookingDto {
  @IsOptional() @IsString()
  reason?: string;
}

export class CheckInDto {
  @IsString()
  token!: string;
}
