import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ResourceFilter {
  type?: 'ROOM' | 'DESK';
  category?: string;
  floorId?: string;
  q?: string;
}

/**
 * User-facing, read-only resource discovery (BRD 7.2). Admin CRUD is Phase 4.
 * All reads are tenant-scoped by the Prisma extension.
 */
@Injectable()
export class ResourceService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: ResourceFilter) {
    return this.prisma.scoped.resource.findMany({
      where: {
        status: 'ACTIVE',
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.floorId ? { floorId: filter.floorId } : {}),
        ...(filter.q
          ? { name: { contains: filter.q, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        floor: {
          select: {
            name: true,
            building: { select: { name: true } },
          },
        },
      },
    });
  }

  async getOne(id: string) {
    const resource = await this.prisma.scoped.resource.findUnique({
      where: { id },
      include: {
        floor: { select: { name: true, building: { select: { name: true } } } },
      },
    });
    if (!resource) throw new NotFoundException('Resource not found.');
    return resource;
  }
}
