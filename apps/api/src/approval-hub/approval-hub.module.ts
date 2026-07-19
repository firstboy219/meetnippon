import { Module } from '@nestjs/common';
import { ApprovalHubService } from './approval-hub.service';
import { ApprovalHubController } from './approval-hub.controller';

@Module({
  controllers: [ApprovalHubController],
  providers: [ApprovalHubService],
})
export class ApprovalHubModule {}
