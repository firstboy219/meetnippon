import {
  Controller, ForbiddenException, Get, Header, NotFoundException, Param, Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { runUnscoped } from '../tenant/tenant-context';
import { buildBookingIcs, locationLabel } from '../mail/ics.util';
import { calendarLinkToken, secretEquals } from '../common/secret-box';

/**
 * The "add to calendar" link from an invitation email.
 *
 * It exists because not every mailbox does calendar work for its owner. A
 * POP3 account simply downloads the message: Outlook never turns it into a
 * meeting request, offers no Accept, and nothing reaches the calendar. Those
 * recipients need a file they can open by hand, and a link is the one place
 * to get it that does not depend on finding an attachment.
 *
 * Unauthenticated on purpose — the person clicking is reading email, not
 * holding a session, and may not have signed into the portal at all. Unlike
 * the room QR route, this returns real content (title, organiser, attendees),
 * so the booking id alone is not enough to see it: the link carries a keyed
 * token derived from that id.
 */
@Controller('public/bookings')
export class PublicCalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Get(':id/calendar.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="meeting.ics"')
  @Header('Cache-Control', 'no-store')
  async calendar(@Param('id') id: string, @Query('t') token?: string): Promise<string> {
    // Fails closed: no configured key means no valid token can exist, so the
    // route stays shut rather than falling back to the id alone.
    const expected = calendarLinkToken(id);
    if (!expected || !token || !secretEquals(token, expected)) {
      throw new ForbiddenException('This calendar link is not valid.');
    }

    // Unscoped by necessity: an anonymous request carries no tenant context.
    // The token already proved the caller was sent this exact booking.
    const booking = await runUnscoped(() =>
      this.prisma.booking.findUnique({
        where: { id },
        select: {
          id: true, title: true, description: true, meetingLink: true,
          startTime: true, endTime: true, status: true, participants: true,
          tenantId: true,
          principal: { select: { fullName: true } },
          resource: {
            select: {
              name: true,
              floor: { select: { name: true, building: { select: { name: true } } } },
            },
          },
          tenant: { select: { isActive: true } },
        },
      }),
    );
    if (!booking || !booking.tenant?.isActive) throw new NotFoundException('Booking not found.');

    const attendees = ((booking.participants as { email?: string }[] | null) ?? [])
      .map((p) => (p?.email ?? '').trim())
      .filter(Boolean);

    const base = this.config.get<string>('APP_BASE_URL') || 'https://meetnippon.cosger.online';
    return buildBookingIcs({
      bookingId: booking.id,
      hostname: new URL(base).hostname,
      title: booking.title,
      description: booking.description,
      location: locationLabel(booking.resource),
      url: booking.meetingLink,
      start: booking.startTime,
      end: booking.endTime,
      organizerEmail: await this.mail.fromAddressFor(booking.tenantId),
      organizerName: booking.principal?.fullName,
      attendeeEmails: attendees,
      // A cancelled booking downloads as a cancellation, so opening the file
      // takes the meeting off the calendar rather than putting it back on.
      // Anything else is an update: re-downloading an unchanged booking should
      // refresh the existing entry, not be discarded as a stale duplicate.
      revision: booking.status === 'CANCELLED' ? 'cancelled' : 'update',
    });
  }
}
