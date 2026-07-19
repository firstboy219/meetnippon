import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApprovalService } from './approval.service';
import { DecideDto } from './dto/decide.dto';

@Controller('approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  listPending() {
    return this.approvals.listPending();
  }

  @Post(':id/decide')
  @Roles('APPROVER', 'ADMIN')
  decide(@Param('id') id: string, @Body() dto: DecideDto) {
    return this.approvals.decide(id, dto.decision, dto.note);
  }
}
