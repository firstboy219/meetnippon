import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

class CreateDirectDto { @IsString() userId!: string; }
class CreateGroupDto {
  @IsString() name!: string;
  @IsArray() @IsString({ each: true }) memberIds!: string[];
}
class SendMessageDto { @IsString() @MinLength(1) body!: string; }

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

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
}
