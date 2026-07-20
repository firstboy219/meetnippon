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
import {
  CreateUserDto,
  UpdateUserDto,
  SetActiveDto,
  ResetPasswordDto,
} from './dto/user-admin.dto';

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
  ) {}

  list() {
    return this.prisma.scoped.user.findMany({
      orderBy: { fullName: 'asc' },
      select: SAFE_SELECT,
    });
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
    await this.prisma.scoped.user.update({ where: { id }, data: { passwordHash } });
    await this.audit.log({ action: 'user.reset_password', entity: 'User', entityId: id });
    return { updated: true };
  }

  private async mustExist(id: string) {
    const user = await this.prisma.scoped.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
