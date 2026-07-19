import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { getTenantStore } from '../tenant/tenant-context';
import { PlanService, Plan } from './plan.service';

class SetPlanDto {
  @IsIn(['FREE', 'PRO', 'ENTERPRISE']) plan!: Plan;
}

@Controller('admin/billing')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class BillingController {
  constructor(private readonly plans: PlanService) {}

  @Get()
  summary() {
    return this.plans.billingSummary(getTenantStore()?.tenantId as string);
  }

  @Put('plan')
  setPlan(@Body() dto: SetPlanDto) {
    return this.plans.setPlan(getTenantStore()?.tenantId as string, dto.plan);
  }
}
