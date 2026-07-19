import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenant/tenant-context';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — no dependencies touched. */
  @Get()
  live() {
    return { status: 'ok', service: 'meetnippon-api', ts: new Date().toISOString() };
  }

  /** Readiness — verifies the DB is reachable. */
  @Get('ready')
  async ready() {
    try {
      await runUnscoped(() => this.prisma.$queryRaw`SELECT 1`);
      return { status: 'ready', db: 'up' };
    } catch {
      return { status: 'degraded', db: 'down' };
    }
  }
}
