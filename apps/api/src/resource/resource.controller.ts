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

  /**
   * Floors that have a plan, for the Denah view. Read-only and available to any
   * signed-in member — picking a floor is not an administrative act.
   */
  @Get('floors')
  floors() { return this.resources.floorsWithPlans(); }

  /** A floor's plan plus every pinned room's live availability. */
  @Get('floors/:floorId/plan')
  floorPlan(@Param('floorId') floorId: string, @Query('day') day?: string) {
    return this.resources.floorPlanView(floorId, day);
  }

  // Literal segments before ':id', so they win the route match.
  @Get('schedule')
  dayGrid(@Query('day') day?: string, @Query('type') type?: 'ROOM' | 'DESK') {
    return this.resources.dayGrid(day, type);
  }

  @Get(':id/schedule')
  schedule(@Param('id') id: string, @Query('day') day?: string) {
    return this.resources.schedule(id, day);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.resources.getOne(id);
  }
}
