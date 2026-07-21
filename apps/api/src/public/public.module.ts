import { Module } from '@nestjs/common';
import { PublicRoomController } from './public-room.controller';

/** Unauthenticated, deliberately narrow surface. Add to it only on purpose. */
@Module({ controllers: [PublicRoomController] })
export class PublicModule {}
