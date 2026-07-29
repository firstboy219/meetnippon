import { Global, Module } from '@nestjs/common';
import { MenuVisibilityService } from './menu-visibility.service';
import { MenuVisibilityController } from './menu-visibility.controller';

/**
 * Global so AuthService can read a caller's hidden-menu set on `/auth/me`
 * without AuthModule importing this one back — the same wiring NotificationModule
 * already uses for the same reason (AuthService also depends on it).
 */
@Global()
@Module({
  controllers: [MenuVisibilityController],
  providers: [MenuVisibilityService],
  exports: [MenuVisibilityService],
})
export class MenuVisibilityModule {}
