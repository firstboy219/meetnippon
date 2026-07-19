import {
  Body, Controller, Delete, Get, Param, Post, Put, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResourceAdminService } from './resource-admin.service';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource-admin.dto';

@Controller('admin/resources')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class ResourceAdminController {
  constructor(private readonly svc: ResourceAdminService) {}

  @Get() list() { return this.svc.listAll(); }
  @Post() create(@Body() d: CreateResourceDto) { return this.svc.create(d); }
  @Put(':id') update(@Param('id') id: string, @Body() d: UpdateResourceDto) { return this.svc.update(id, d); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
