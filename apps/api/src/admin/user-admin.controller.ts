import {
  Body, Controller, Get, Param, Post, Put, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserAdminService } from './user-admin.service';
import {
  CreateUserDto, UpdateUserDto, SetActiveDto, ResetPasswordDto,
} from './dto/user-admin.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class UserAdminController {
  constructor(private readonly svc: UserAdminService) {}

  @Get() list() { return this.svc.list(); }
  @Post() create(@Body() d: CreateUserDto) { return this.svc.create(d); }
  @Put(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.svc.update(id, d); }
  @Put(':id/active') setActive(@Param('id') id: string, @Body() d: SetActiveDto) { return this.svc.setActive(id, d); }
  @Put(':id/password') resetPassword(@Param('id') id: string, @Body() d: ResetPasswordDto) { return this.svc.resetPassword(id, d); }
}
