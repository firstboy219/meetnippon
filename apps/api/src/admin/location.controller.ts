import {
  Body, Controller, Delete, Get, Param, Post, Put, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LocationService } from './location.service';
import {
  UpsertOfficeLocationDto, UpsertBuildingDto, UpsertFloorDto, UpsertFloorPlanDto,
} from './dto/location.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class LocationController {
  constructor(private readonly svc: LocationService) {}

  @Get('offices') offices() { return this.svc.listOffices(); }
  @Post('offices') createOffice(@Body() d: UpsertOfficeLocationDto) { return this.svc.createOffice(d); }
  @Put('offices/:id') updateOffice(@Param('id') id: string, @Body() d: UpsertOfficeLocationDto) { return this.svc.updateOffice(id, d); }
  @Delete('offices/:id') removeOffice(@Param('id') id: string) { return this.svc.removeOffice(id); }

  @Get('buildings') buildings() { return this.svc.listBuildings(); }
  @Post('buildings') createBuilding(@Body() d: UpsertBuildingDto) { return this.svc.createBuilding(d); }
  @Put('buildings/:id') updateBuilding(@Param('id') id: string, @Body() d: UpsertBuildingDto) { return this.svc.updateBuilding(id, d); }
  @Delete('buildings/:id') removeBuilding(@Param('id') id: string) { return this.svc.removeBuilding(id); }

  @Get('floors') floors() { return this.svc.listFloors(); }
  @Post('floors') createFloor(@Body() d: UpsertFloorDto) { return this.svc.createFloor(d); }
  @Put('floors/:id') updateFloor(@Param('id') id: string, @Body() d: UpsertFloorDto) { return this.svc.updateFloor(id, d); }
  @Delete('floors/:id') removeFloor(@Param('id') id: string) { return this.svc.removeFloor(id); }

  @Get('floors/:id/plan') floorPlan(@Param('id') id: string) { return this.svc.getFloorPlan(id); }
  @Put('floors/:id/plan') saveFloorPlan(@Param('id') id: string, @Body() d: UpsertFloorPlanDto) {
    return this.svc.saveFloorPlan(id, d);
  }
}
