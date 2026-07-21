import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceService } from './resource.service';

@Controller('resources')
@UseGuards(JwtAuthGuard)
export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  @Get()
  list(
    @Query('type') type?: 'ROOM' | 'DESK',
    @Query('category') category?: string,
    @Query('floorId') floorId?: string,
    @Query('q') q?: string,
  ) {
    return this.resources.list({ type, category, floorId, q });
  }

  // Declared before ':id' so the literal segment wins the route match.
  @Get(':id/schedule')
  schedule(@Param('id') id: string, @Query('day') day?: string) {
    return this.resources.schedule(id, day);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.resources.getOne(id);
  }
}
