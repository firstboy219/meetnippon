import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApprovalHubService } from './approval-hub.service';
import { CreateExternalTaskDto, DecideExternalTaskDto } from './dto/approval-hub.dto';

@Controller('approval-hub')
@UseGuards(JwtAuthGuard)
export class ApprovalHubController {
  constructor(private readonly hub: ApprovalHubService) {}

  @Post('tasks') create(@Body() dto: CreateExternalTaskDto) { return this.hub.create(dto); }
  @Get('tasks') mine() { return this.hub.listForApprover(); }
  @Post('tasks/:id/decide') decide(@Param('id') id: string, @Body() dto: DecideExternalTaskDto) { return this.hub.decide(id, dto); }
}
