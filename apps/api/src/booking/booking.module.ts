import { Module } from '@nestjs/common';
import { PolicyResolverService } from './policy/policy-resolver.service';
import { PolicyService } from './policy/policy.service';
import { PolicyController } from './policy/policy.controller';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

@Module({
  controllers: [PolicyController, BookingController, ApprovalController],
  providers: [
    PolicyResolverService,
    PolicyService,
    BookingService,
    ApprovalService,
  ],
  exports: [PolicyResolverService],
})
export class BookingModule {}
