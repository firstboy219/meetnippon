import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserAdminService } from './user-admin.service';
import {
  CreateUserDto, UpdateUserDto, SetActiveDto, ResetPasswordDto, ImportUsersDto,
  ApproveRegistrationDto, RejectRegistrationDto,
} from './dto/user-admin.dto';
import { UserListQueryDto } from './dto/overview-query.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class UserAdminController {
  constructor(private readonly svc: UserAdminService) {}

  @Get() list(@Query() q: UserListQueryDto) { return this.svc.list(q); }
  @Post() create(@Body() d: CreateUserDto) { return this.svc.create(d); }
  /** Literal paths declared before ':id' routes so they win the match. */
  @Post('import') import(@Body() d: ImportUsersDto) { return this.svc.importUsers(d); }
  @Get('requests') requests() { return this.svc.listRegistrationRequests(); }
  @Post('requests/:id/approve') approve(@Param('id') id: string, @Body() d: ApproveRegistrationDto) {
    return this.svc.approveRegistration(id, d);
  }
  @Post('requests/:id/reject') reject(@Param('id') id: string, @Body() d: RejectRegistrationDto) {
    return this.svc.rejectRegistration(id, d.note);
  }
  @Put(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.svc.update(id, d); }
  @Put(':id/active') setActive(@Param('id') id: string, @Body() d: SetActiveDto) { return this.svc.setActive(id, d); }
  @Put(':id/password') resetPassword(@Param('id') id: string, @Body() d: ResetPasswordDto) { return this.svc.resetPassword(id, d); }
  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }
}
