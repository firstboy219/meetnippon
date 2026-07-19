import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { runUnscoped } from '../tenant/tenant-context';

export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  maxUsers: number | null; // null = unlimited
  maxResources: number | null;
  features: string[]; // integration flags allowed on this plan
}

const LIMITS: Record<Plan, PlanLimits> = {
  FREE: { maxUsers: 10, maxResources: 5, features: ['chat'] },
  PRO: { maxUsers: 100, maxResources: 100, features: ['chat', 'calendar_sync', 'sso_microsoft', 'sso_google', 'recording'] },
  ENTERPRISE: { maxUsers: null, maxResources: null, features: ['chat', 'calendar_sync', 'sso_microsoft', 'sso_google', 'recording', 'whatsapp'] },
};

/**
 * Subscription plans (Phase 10). The active plan is stored in the `billing`
 * feature-flag config (no schema change). Real payment is a Stripe escalation;
 * plan changes are mock/admin-driven until credentials arrive.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
  ) {}

  limitsFor(plan: Plan): PlanLimits {
    return LIMITS[plan] ?? LIMITS.FREE;
  }

  async getPlan(tenantId: string): Promise<Plan> {
    const cfg = await this.flags.configFor(tenantId, 'billing');
    const p = String(cfg.plan ?? 'FREE').toUpperCase();
    return (['FREE', 'PRO', 'ENTERPRISE'].includes(p) ? p : 'FREE') as Plan;
  }

  async setPlan(tenantId: string, plan: Plan) {
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(plan)) {
      throw new BadRequestException('Unknown plan.');
    }
    const cfg = await this.flags.configFor(tenantId, 'billing');
    await this.flags.upsert('billing', true, { ...cfg, plan });
    return { plan };
  }

  private countUsers(tenantId: string) {
    return runUnscoped(() => this.prisma.user.count({ where: { tenantId, isActive: true } }));
  }
  private countResources(tenantId: string) {
    return runUnscoped(() => this.prisma.resource.count({ where: { tenantId } }));
  }

  async assertCanAddUser(tenantId: string) {
    const limit = this.limitsFor(await this.getPlan(tenantId)).maxUsers;
    if (limit != null && (await this.countUsers(tenantId)) >= limit) {
      throw new BadRequestException(`Your plan allows up to ${limit} users. Upgrade to add more.`);
    }
  }
  async assertCanAddResource(tenantId: string) {
    const limit = this.limitsFor(await this.getPlan(tenantId)).maxResources;
    if (limit != null && (await this.countResources(tenantId)) >= limit) {
      throw new BadRequestException(`Your plan allows up to ${limit} resources. Upgrade to add more.`);
    }
  }

  async billingSummary(tenantId: string) {
    const plan = await this.getPlan(tenantId);
    const limits = this.limitsFor(plan);
    const [users, resources] = await Promise.all([this.countUsers(tenantId), this.countResources(tenantId)]);
    return { plan, limits, usage: { users, resources }, plans: LIMITS };
  }
}
