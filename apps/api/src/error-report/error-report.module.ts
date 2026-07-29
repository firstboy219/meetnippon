import { Module } from '@nestjs/common';
import { ErrorReportService } from './error-report.service';
import { ErrorReportController, AdminErrorReportController } from './error-report.controller';

@Module({
  controllers: [ErrorReportController, AdminErrorReportController],
  providers: [ErrorReportService],
})
export class ErrorReportModule {}
