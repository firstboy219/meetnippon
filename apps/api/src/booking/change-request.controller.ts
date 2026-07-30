import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangeRequestService } from './change-request.service';
import { CreateChangeRequestDto, DecideChangeRequestDto } from './dto/change-request.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ChangeRequestController {
  constructor(private readonly svc: ChangeRequestService) {}

  /** Ask the author of someone else's booking to move it. */
  @Post('bookings/:id/change-requests')
  create(@Param('id') id: string, @Body() dto: CreateChangeRequestDto) {
    return this.svc.create(id, dto);
  }

  /** Requests waiting on the caller's decision (they own the bookings). */
  @Get('change-requests/incoming')
  incoming() {
    return this.svc.listIncoming();
  }

  /** Requests the caller has made, newest first. */
  @Get('change-requests/mine')
  mine() {
    return this.svc.listMine();
  }

  @Post('change-requests/:id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideChangeRequestDto) {
    return this.svc.decide(id, dto.decision, dto.note, dto.ownerNewStartTime, dto.ownerNewEndTime);
  }
}
