import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BroadcastService } from './broadcast.service';
import {
  BroadcastRecipientsQueryDto, ResendActivationDto, SendAnnouncementDto,
} from './dto/broadcast.dto';

/** Admin-only: bulk email to a chosen slice of the roster. */
@Controller('admin/broadcast')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class BroadcastController {
  constructor(private readonly svc: BroadcastService) {}

  @Get('recipients')
  recipients(@Query() q: BroadcastRecipientsQueryDto) {
    return this.svc.recipients(q);
  }

  @Post('resend-activation')
  resendActivation(@Body() dto: ResendActivationDto) {
    return this.svc.resendActivation(dto);
  }

  @Post('announcement')
  sendAnnouncement(@Body() dto: SendAnnouncementDto) {
    return this.svc.sendAnnouncement(dto);
  }
}
