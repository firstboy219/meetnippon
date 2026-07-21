import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore } from '../tenant/tenant-context';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { MailService } from '../mail/mail.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';

/** What the profile screen may see about the caller. Never the hash. */
const SELECT = {
  id: true, email: true, personalEmail: true, fullName: true, avatarUrl: true,
  role: true, department: true, languagePref: true, createdAt: true,
} as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private me() {
    return getTenantStore()?.userId as string;
  }

  async get() {
    const user = await this.prisma.scoped.user.findUnique({
      where: { id: this.me() }, select: SELECT,
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async update(dto: UpdateProfileDto) {
    const id = this.me();

    if (dto.personalEmail) {
      const personal = dto.personalEmail.trim().toLowerCase();
      // Refuse an address that is already somebody's login. Allowing it would
      // let one person's "personal" address shadow another's identity in any
      // future lookup, and it is a confusing thing to permit even now.
      const clash = await this.prisma.scoped.user.findFirst({
        where: { email: personal, NOT: { id } },
        select: { id: true },
      });
      if (clash) throw new BadRequestException('That address already belongs to another account.');
    }

    const user = await this.prisma.scoped.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
        ...(dto.languagePref !== undefined ? { languagePref: dto.languagePref } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl || null } : {}),
        ...(dto.personalEmail !== undefined
          ? { personalEmail: dto.personalEmail.trim().toLowerCase() || null }
          : {}),
      },
      select: SELECT,
    });

    await this.audit.log({
      action: 'profile.update',
      entity: 'User',
      entityId: id,
      // Record which fields moved, not their values.
      metadata: { fields: Object.keys(dto) },
    });
    return user;
  }

  /**
   * Change own password.
   *
   * The current password is required even though the caller is authenticated:
   * a bearer token may have been left on a shared machine, and a password
   * change is exactly the action an attacker with a borrowed session wants.
   */
  async changePassword(dto: ChangePasswordDto) {
    const id = this.me();
    const user = await this.prisma.scoped.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    if (!user.passwordHash) {
      // SSO-provisioned accounts have no password to replace.
      throw new BadRequestException('This account signs in with SSO and has no password.');
    }
    const ok = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!ok) throw new BadRequestException('Your current password is not correct.');

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('The new password must be different from the current one.');
    }

    await this.prisma.scoped.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });
    await this.audit.log({ action: 'profile.password_change', entity: 'User', entityId: id });

    // Tell them out of band. If they did not do this, the mail is the warning.
    this.mail.send({
      tenantId: getTenantStore()?.tenantId as string,
      to: user.email,
      subject: 'Your password was changed',
      text: [
        `Hi ${user.fullName},`,
        '',
        'The password for your MeetNippon account was just changed.',
        '',
        'If this was you, no action is needed.',
        'If it was not, contact your workspace administrator immediately.',
      ].join('\n'),
    });

    return { changed: true };
  }
}
