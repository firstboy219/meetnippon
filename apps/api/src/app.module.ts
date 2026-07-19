import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { ResourceModule } from './resource/resource.module';
import { AdminModule } from './admin/admin.module';
import { FeatureFlagModule } from './flags/feature-flag.module';
import { CalendarModule } from './calendar/calendar.module';
import { SsoModule } from './sso/sso.module';
import { HealthModule } from './health/health.module';
import { TenantContextMiddleware } from './tenant/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // JwtService is used by the tenant middleware and auth; secrets are passed
    // explicitly per-call (access vs refresh), so no default secret here.
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    PrismaModule,
    AuditModule,
    FeatureFlagModule,
    CalendarModule,
    TenantModule,
    AuthModule,
    BookingModule,
    ResourceModule,
    AdminModule,
    SsoModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
