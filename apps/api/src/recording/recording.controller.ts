import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordingService } from './recording.service';

@Controller('recordings')
@UseGuards(JwtAuthGuard)
export class RecordingController {
  constructor(private readonly recordings: RecordingService) {}

  @Post(':bookingId') request(@Param('bookingId') bookingId: string) { return this.recordings.request(bookingId); }
  @Get(':bookingId') get(@Param('bookingId') bookingId: string) { return this.recordings.get(bookingId); }
}
