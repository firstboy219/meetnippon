import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get() list() { return this.notifications.list(); }
  @Get('unread-count') unread() { return this.notifications.unreadCount(); }
  @Post(':id/read') read(@Param('id') id: string) { return this.notifications.markRead(id); }
  @Post('read-all') readAll() { return this.notifications.markAllRead(); }
}
