import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

class SetPresenceDto {
  /** One of AVAILABLE | BUSY | DND | AWAY | OFFLINE, or AUTO to stop overriding. */
  @IsString() presence!: string;
}

@Controller('me/presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get() mine() { return this.presence.mine(); }

  @Put() set(@Body() dto: SetPresenceDto) { return this.presence.setMine(dto.presence); }

  /** Portal calls this on a timer; it is what keeps auto-status truthful. */
  @Post('heartbeat') heartbeat() { return this.presence.heartbeat(); }
}
