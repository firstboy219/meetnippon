import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/feedback.dto';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** Who built the platform and where to send which kind of problem. */
  @Get('contacts')
  contacts() {
    return this.feedback.contacts();
  }

  @Post()
  @HttpCode(200)
  submit(@Body() dto: SubmitFeedbackDto) {
    return this.feedback.submit(dto);
  }
}
