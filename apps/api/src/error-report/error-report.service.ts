import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStore } from '../tenant/tenant-context';
import { pageParams, toPage } from '../common/pagination';
import { CreateErrorReportDto, ErrorReportQueryDto } from './dto/error-report.dto';

@Injectable()
export class ErrorReportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateErrorReportDto) {
    const store = getTenantStore();
    const userId = store?.userId;
    const user = userId
      ? await this.prisma.scoped.user.findUnique({ where: { id: userId }, select: { email: true } })
      : null;

    await this.prisma.scoped.errorReport.create({
      data: {
        userId: userId ?? null,
        userEmail: user?.email ?? null,
        app: dto.app,
        route: dto.route ?? null,
        message: dto.message,
        status: dto.status ?? null,
        endpoint: dto.endpoint ?? null,
        method: dto.method ?? null,
        stack: dto.stack ?? null,
        userAgent: dto.userAgent ?? null,
      } as any,
    });
    // The whole point is that this always succeeds from the reporter's point
    // of view — a failure to log a bug report should not itself become one.
    return { received: true };
  }

  async list(q: ErrorReportQueryDto) {
    const { skip, take, page, pageSize } = pageParams(q);
    const term = q.q?.trim();
    const where = {
      ...(q.app ? { app: q.app } : {}),
      ...(term ? { message: { contains: term, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.scoped.errorReport.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
      }),
      this.prisma.scoped.errorReport.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async getOne(id: string) {
    const row = await this.prisma.scoped.errorReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Error report not found.');
    return row;
  }
}
