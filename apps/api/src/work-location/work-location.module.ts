import { Module } from '@nestjs/common';
import { WorkLocationService } from './work-location.service';
import { WorkLocationController } from './work-location.controller';

@Module({
  controllers: [WorkLocationController],
  providers: [WorkLocationService],
})
export class WorkLocationModule {}
