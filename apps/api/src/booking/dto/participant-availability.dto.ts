import { ArrayMaxSize, IsArray, IsEmail, IsISO8601 } from 'class-validator';

export class ParticipantAvailabilityDto {
  /** Capped so this cannot be turned into a bulk directory probe. */
  @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  emails!: string[];

  @IsISO8601() startTime!: string;
  @IsISO8601() endTime!: string;
}
