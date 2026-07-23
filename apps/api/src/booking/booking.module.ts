import { Module } from '@nestjs/common';
import { PolicyResolverService } from './policy/policy-resolver.service';
import { PolicyService } from './policy/policy.service';
import { PolicyController } from './policy/policy.controller';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { ChangeRequestService } from './change-request.service';
import { ChangeRequestController } from './change-request.controller';
import { NoShowService } from './no-show.service';

@Module({
  controllers: [
    PolicyController,
    BookingController,
    ApprovalController,
    ChangeRequestController,
  ],
  providers: [
    PolicyResolverService,
    PolicyService,
    BookingService,
    ApprovalService,
    ChangeRequestService,
    NoShowService,
  ],
  exports: [PolicyResolverService],
})
export class BookingModule {}
