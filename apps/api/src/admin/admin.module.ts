import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { ResourceAdminService } from './resource-admin.service';
import { ResourceAdminController } from './resource-admin.controller';
import { UserAdminService } from './user-admin.service';
import { UserAdminController } from './user-admin.controller';
import { BrandingService } from './branding.service';
import { BrandingController } from './branding.controller';
import { AdminOverviewController } from './admin-overview.controller';
import { FeatureFlagController } from './feature-flag.controller';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [
    LocationController,
    ResourceAdminController,
    UserAdminController,
    BrandingController,
    AdminOverviewController,
    FeatureFlagController,
    AnalyticsController,
  ],
  providers: [
    LocationService,
    ResourceAdminService,
    UserAdminService,
    BrandingService,
    AnalyticsService,
  ],
})
export class AdminModule {}
