import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get() overview() { return this.analytics.overview(); }
}
