import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/branding.dto';

@Controller('admin/branding')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class BrandingController {
  constructor(private readonly svc: BrandingService) {}

  @Get() get() { return this.svc.get(); }
  @Put() update(@Body() d: UpdateBrandingDto) { return this.svc.update(d); }
}
