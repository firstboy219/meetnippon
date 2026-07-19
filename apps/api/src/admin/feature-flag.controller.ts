import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FeatureFlagService } from '../flags/feature-flag.service';

class UpsertFlagDto {
  @IsString() key!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

@Controller('admin/feature-flags')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class FeatureFlagController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get()
  list() {
    return this.flags.list();
  }

  @Put()
  upsert(@Body() dto: UpsertFlagDto) {
    return this.flags.upsert(dto.key, dto.enabled, dto.config ?? {});
  }
}
