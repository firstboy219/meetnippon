import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CancelBookingDto, CheckInDto } from './dto/cancel-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  create(@Body() dto: CreateBookingDto) {
    return this.bookings.create(dto);
  }

  @Get()
  listMine() {
    return this.bookings.listMine();
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

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookings.cancel(id, dto.reason);
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: CheckInDto) {
    return this.bookings.checkIn(id, dto.token);
  }
}
