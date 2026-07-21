import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CancelBookingDto, CheckInDto } from './dto/cancel-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { ParticipantAvailabilityDto } from './dto/participant-availability.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @Get()
  listMine(@Query() q: ListBookingsQueryDto) {
    return this.bookings.listMine(q);
  }

  /** Schedule assistant — who is already busy in the proposed slot. */
  @Post('participant-availability')
  participantAvailability(@Body() dto: ParticipantAvailabilityDto) {
    return this.bookings.participantAvailability(dto.emails, dto.startTime, dto.endTime);
  }

  // NOTE: declared before ':id' so the literal path wins the route match.
  @Get('availability')
  availability(@Query() q: AvailabilityQueryDto) {
    return this.bookings.availability(q);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.bookings.getOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookings.update(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancel(id, dto.reason);
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: CheckInDto) {
    return this.bookings.checkIn(id, dto.token);
  }
}
