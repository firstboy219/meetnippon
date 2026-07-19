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

@Module({
  controllers: [
    LocationController,
    ResourceAdminController,
    UserAdminController,
    BrandingController,
    AdminOverviewController,
  ],
  providers: [
    LocationService,
    ResourceAdminService,
    UserAdminService,
    BrandingService,
  ],
})
export class AdminModule {}
