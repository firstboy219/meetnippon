import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

class DirectoryQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;
}

/**
 * The colleague list behind participant and chat pickers.
 *
 * Open to any authenticated member of the tenant, not just admins — you cannot
 * invite someone to a meeting you cannot look up. It exposes only what a picker
 * needs to render a row; anything more belongs in the admin user API.
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class DirectoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  @Get('directory')
  async directory(@Query() q: DirectoryQueryDto) {
    const term = q.q?.trim();
    const users = await this.prisma.scoped.user.findMany({
      where: {
        isActive: true,
        ...(term
          ? {
              OR: [
                { fullName: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, email: true, department: true },
      orderBy: { fullName: 'asc' },
      take: 50,
    });

    // Derived, not the stored column — see PresenceService for why.
    const view = await this.presence.viewFor(users.map((u) => u.id));
    return users.map((u) => ({
      ...u,
      presence: view.get(u.id)?.presence ?? 'OFFLINE',
      presenceReason: view.get(u.id)?.reason ?? null,
    }));
  }
}
