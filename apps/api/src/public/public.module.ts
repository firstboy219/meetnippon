import { Module } from '@nestjs/common';
import { PublicRoomController } from './public-room.controller';
import { PublicCalendarController } from './public-calendar.controller';

/** Unauthenticated, deliberately narrow surface. Add to it only on purpose. */
@Module({ controllers: [PublicRoomController, PublicCalendarController] })
export class PublicModule {}
