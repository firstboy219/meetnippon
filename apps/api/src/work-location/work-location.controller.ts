import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkLocationService } from './work-location.service';
import { ReportLocationDto } from './dto/report-location.dto';

@Controller('work-location')
@UseGuards(JwtAuthGuard)
export class WorkLocationController {
  constructor(private readonly wl: WorkLocationService) {}

  @Post('report') report(@Body() dto: ReportLocationDto) { return this.wl.report(dto); }
  @Get('today') today() { return this.wl.today(); }
}
