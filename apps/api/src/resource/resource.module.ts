import { Module } from '@nestjs/common';
import { ResourceService } from './resource.service';
import { ResourceController } from './resource.controller';
import { BookingModule } from '../booking/booking.module';

@Module({
  // BookingModule exports PolicyResolverService — the listing needs the same
  // resolver the booking gate uses, so both agree on what a rule says.
  imports: [BookingModule],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
