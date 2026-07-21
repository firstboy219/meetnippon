import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

class CreateDirectDto { @IsString() userId!: string; }
class CreateGroupDto {
  @IsString() name!: string;
  @IsArray() @IsString({ each: true }) memberIds!: string[];
}
class SendMessageDto { @IsString() @MinLength(1) body!: string; }
class MuteDto { @IsBoolean() muted!: boolean; }

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  // Literal path before the ':id' routes so it wins the match.
  @Get('unread') unread() { return this.chat.unreadCount(); }

  @Get('conversations') list() { return this.chat.listConversations(); }
  @Post('conversations/direct') direct(@Body() dto: CreateDirectDto) { return this.chat.createDirect(dto.userId); }
  @Post('conversations/group') group(@Body() dto: CreateGroupDto) { return this.chat.createGroup(dto.name, dto.memberIds); }
  @Get('conversations/:id/messages') messages(@Param('id') id: string) { return this.chat.getMessages(id); }

  @Post('conversations/:id/messages')
  async send(@Param('id') id: string, @Body() dto: SendMessageDto) {
    const message = await this.chat.sendMessage(id, dto.body);
    this.gateway.emitMessage(id, message); // fan out to connected sockets
    return message;
  }

  @Post('conversations/:id/read') read(@Param('id') id: string) { return this.chat.markRead(id); }

  @Post('conversations/:id/mute')
  mute(@Param('id') id: string, @Body() dto: MuteDto) { return this.chat.setMuted(id, dto.muted); }
}
