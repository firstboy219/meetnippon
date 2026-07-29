import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ErrorReportService } from './error-report.service';
import { CreateErrorReportDto, ErrorReportQueryDto } from './dto/error-report.dto';

/** Any signed-in role can report a bug they hit — this is not an admin action. */
@Controller('error-reports')
@UseGuards(JwtAuthGuard)
export class ErrorReportController {
  constructor(private readonly svc: ErrorReportService) {}

  @Post()
  create(@Body() dto: CreateErrorReportDto) {
    return this.svc.create(dto);
  }
}

/** Reading the reports back, in full detail, is admin-only. */
@Controller('admin/error-reports')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class AdminErrorReportController {
  constructor(private readonly svc: ErrorReportService) {}

  @Get()
  list(@Query() q: ErrorReportQueryDto) {
    return this.svc.list(q);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }
}
