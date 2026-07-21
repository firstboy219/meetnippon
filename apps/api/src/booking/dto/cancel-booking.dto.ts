import { IsOptional, IsString } from 'class-validator';

export class CancelBookingDto {
  @IsOptional() @IsString()
  reason?: string;
}

export class CheckInDto {
  /**
   * Only supplied by the room's QR flow. The owner checking in from the portal
   * sends nothing — they are already authenticated and cannot see the token.
   */
  @IsOptional() @IsString()
  token?: string;
}
