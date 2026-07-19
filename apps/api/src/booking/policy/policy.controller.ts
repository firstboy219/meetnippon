import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PolicyService } from './policy.service';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';

@Controller('policies')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Get()
  list() {
    return this.policies.list();
  }

  @Put()
  upsert(@Body() dto: UpsertPolicyDto) {
    return this.policies.upsert(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.policies.remove(id);
  }

  @Get('effective/:resourceId')
  effective(@Param('resourceId') resourceId: string) {
    return this.policies.effectiveForResource(resourceId);
  }
}
