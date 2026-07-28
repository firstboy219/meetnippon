import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { hashPassword } from '../auth/password.util';
import { PlanService } from '../billing/plan.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { pageParams, toPage } from '../common/pagination';
import { UserListQueryDto } from './dto/overview-query.dto';
import {
  CreateUserDto,
  UpdateUserDto,
  SetActiveDto,
  ResetPasswordDto,
  ImportUsersDto,
} from './dto/user-admin.dto';
import { AuthService } from '../auth/auth.service';

const SAFE_SELECT = {
  id: true, email: true, fullName: true, role: true, department: true,
  languagePref: true, isActive: true, presence: true, lastSeenAt: true, createdAt: true,
} as const;

@Injectable()
export class UserAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plan: PlanService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  async list(q: UserListQueryDto = {}) {
    const { skip, take, page, pageSize } = pageParams(q);
    const term = q.q?.trim();
    const where = {
      ...(q.role ? { role: q.role as any } : {}),
      ...(q.isActive !== undefined ? { isActive: q.isActive === 'true' } : {}),
      ...(term
        ? {
          OR: [
            { fullName: { contains: term, mode: 'insensitive' as const } },
            { email: { contains: term, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.scoped.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        select: SAFE_SELECT,
        skip,
        take,
      }),
      this.prisma.scoped.user.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const clash = await this.prisma.scoped.user.findFirst({ where: { email } });
    if (clash) throw new BadRequestException('An account with this email already exists.');
    await this.plan.assertCanAddUser(getTenantStore()?.tenantId as string);

    const tempPassword = dto.password ?? Math.random().toString(36).slice(2, 10) + 'A1!';
    const passwordHash = await hashPassword(tempPassword);
    const user = await this.prisma.scoped.user.create({
      data: {
        email,
        fullName: dto.fullName,
        role: dto.role ?? 'EMPLOYEE',
        department: dto.department ?? null,
        languagePref: dto.languagePref ?? 'EN',
        passwordHash,
        // Whoever set this password (the platform or the admin) knows it, so
        // the account is not really the user's until they replace it.
        mustChangePassword: true,
      } as any,
      select: SAFE_SELECT,
    });
    await this.audit.log({ action: 'user.create', entity: 'User', entityId: user.id, metadata: { role: user.role } });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: getTenantStore()?.tenantId as string },
      select: { name: true },
    });
    const base = this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online';
    this.mail.send({
      tenantId: getTenantStore()?.tenantId as string,
      to: email,
      subject: `Your ${tenant?.name ?? 'MeetNippon'} account is ready`,
      text: [
        `Hi ${dto.fullName},`,
        '',
        `An account has been created for you on ${tenant?.name ?? 'MeetNippon'}.`,
        '',
        `Email:    ${email}`,
        // Only ever mail a password the platform generated. One the admin chose
        // is theirs to hand over — it may be in use somewhere else.
        ...(dto.password ? [] : [`Password: ${tempPassword}`, '', 'Please change it after your first sign-in.']),
      ].join('\n'),
      action: { label: 'Sign in', url: `${base}/login` },
    });

    // Return the temp password only when the admin didn't set one (for handoff).
    return dto.password ? user : { ...user, tempPassword };
  }

  /**
   * Bulk-create users from an uploaded roster (name, email, position).
   *
   * No passwords are minted: each account starts with none and is reachable
   * only through a one-time activation link, so nothing secret has to travel
   * through a spreadsheet or a chat message. Rows are processed independently —
   * one bad address must not discard the other 200 — and the caller gets a
   * per-row report.
   */
  async importUsers(dto: ImportUsersDto) {
    const tenantId = getTenantStore()?.tenantId as string;
    const created: { email: string; fullName: string }[] = [];
    const errors: { row: number; email: string; reason: string }[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < dto.rows.length; i++) {
      const raw = dto.rows[i];
      const rowNo = i + 1;
      const email = (raw.email ?? '').trim().toLowerCase();
      const fullName = (raw.fullName ?? '').trim();
      try {
        if (!fullName) throw new Error('Name is empty.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Not a valid email address.');
        // A file that repeats an address would otherwise fail late, on the
        // unique index, with a far less obvious message.
        if (seen.has(email)) throw new Error('Duplicated within this file.');
        seen.add(email);

        const clash = await this.prisma.scoped.user.findFirst({ where: { email } });
        if (clash) throw new Error('An account with this email already exists.');
        await this.plan.assertCanAddUser(tenantId);

        const user = await this.prisma.scoped.user.create({
          data: {
            email,
            fullName,
            role: 'EMPLOYEE',
            department: raw.department?.trim() || null,
            languagePref: 'EN',
            // No password at all: activation is the only way in.
            passwordHash: null,
            mustChangePassword: false,
          } as any,
          select: SAFE_SELECT,
        });
        created.push({ email: user.email, fullName: user.fullName });

        if (dto.sendInvites !== false) {
          await this.auth.sendActivationEmail({
            id: user.id, tenantId, email: user.email, fullName: user.fullName,
          });
        }
      } catch (e: any) {
        errors.push({ row: rowNo, email: email || '(blank)', reason: e?.message ?? 'Could not import.' });
      }
    }

    await this.audit.log({
      action: 'user.import',
      entity: 'User',
      metadata: { created: created.length, failed: errors.length, invited: dto.sendInvites !== false },
    });
    return { created: created.length, failed: errors.length, users: created, errors };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.mustExist(id);
    const user = await this.prisma.scoped.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.languagePref !== undefined ? { languagePref: dto.languagePref } : {}),
      },
      select: SAFE_SELECT,
    });
    await this.audit.log({ action: 'user.update', entity: 'User', entityId: id });
    return user;
  }

  async setActive(id: string, dto: SetActiveDto) {
    await this.mustExist(id);
    const me = getTenantStore()?.userId;
    if (id === me && !dto.isActive) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }
    const user = await this.prisma.scoped.user.update({
      where: { id }, data: { isActive: dto.isActive }, select: SAFE_SELECT,
    });
    await this.audit.log({ action: dto.isActive ? 'user.activate' : 'user.deactivate', entity: 'User', entityId: id });
    return user;
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    await this.mustExist(id);
    const passwordHash = await hashPassword(dto.password);
    // Same reasoning as create(): an admin-chosen password is a handover, not
    // the user's own — they must replace it on the next sign-in.
    await this.prisma.scoped.user.update({
      where: { id }, data: { passwordHash, mustChangePassword: true },
    });
    await this.audit.log({ action: 'user.reset_password', entity: 'User', entityId: id });
    return { updated: true };
  }

  private async mustExist(id: string) {
    const user = await this.prisma.scoped.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
