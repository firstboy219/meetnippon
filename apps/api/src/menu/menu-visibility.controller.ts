import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuVisibilityService } from './menu-visibility.service';
import { SaveMenuVisibilityDto } from './dto/menu-visibility.dto';

/** Admin-only: which sidebar items each role may see in the user portal. */
@Controller('admin/menu-visibility')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class MenuVisibilityController {
  constructor(private readonly svc: MenuVisibilityService) {}

  @Get() list() { return this.svc.matrix(); }
  @Put() save(@Body() dto: SaveMenuVisibilityDto) { return this.svc.save(dto.rows); }
}
