/**
 * Minimal RFC 5545 (iCalendar) builder — just enough for a single-event
 * meeting invite attachment. No line folding: every field this app sends
 * (titles, room names, short notes) stays well under the lengths where
 * folding actually matters to real mail/calendar clients, and skipping it
 * keeps this simple and easy to eyeball-verify.
 */

export interface IcsEvent {
  /** Stable across an edit/reschedule of the same booking — ties the update
   *  to the original event instead of creating a duplicate on the calendar. */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end: Date;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmails?: string[];
  /** Bumped on every edit so calendar apps know a REQUEST supersedes the last one. */
  sequence?: number;
  status?: 'CONFIRMED' | 'CANCELLED';
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(event: IcsEvent): string {
  const cancelled = event.status === 'CANCELLED';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MeetNippon//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizerEmail
      ? [`ORGANIZER;CN=${escapeText(event.organizerName ?? event.organizerEmail)}:mailto:${event.organizerEmail}`]
      : []),
    ...(event.attendeeEmails ?? []).map(
      (e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`,
    ),
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** "Room · Building · Floor" — the one place that shape is decided. */
export function locationLabel(resource?: {
  name: string;
  floor?: { name?: string | null; building?: { name?: string | null } | null } | null;
} | null): string {
  if (!resource) return 'Online meeting';
  return [resource.name, resource.floor?.building?.name, resource.floor?.name]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The calendar file for a booking.
 *
 * Both the invitation email and the public "add to calendar" link go through
 * here, so a booking's UID, SEQUENCE and STATUS cannot drift between the two —
 * a calendar client matches them by UID and ignores anything whose SEQUENCE
 * did not advance, so those three are exactly the fields that must agree.
 */
export function buildBookingIcs(input: {
  bookingId: string;
  /** Host part of APP_BASE_URL — the UID's domain, stable per deployment. */
  hostname: string;
  title: string;
  description?: string | null;
  location: string;
  url?: string | null;
  start: Date;
  end: Date;
  organizerEmail?: string;
  organizerName?: string | null;
  attendeeEmails?: string[];
  /**
   * `initial` is the first send (SEQUENCE 0); `update` is any later revision,
   * including a fresh download of an unchanged booking, so re-adding it
   * refreshes the existing entry instead of being discarded as stale.
   */
  revision: 'initial' | 'update' | 'cancelled';
}): string {
  return buildIcs({
    uid: `${input.bookingId}@${input.hostname}`,
    title: input.title,
    description: input.description?.trim() || undefined,
    location: input.location,
    url: input.url?.trim() || undefined,
    start: input.start,
    end: input.end,
    organizerEmail: input.organizerEmail,
    organizerName: input.organizerName ?? undefined,
    attendeeEmails: input.attendeeEmails,
    // Must strictly increase per UID or clients treat the message as a stale
    // duplicate; wall-clock seconds are monotonic without a persisted counter.
    sequence: input.revision === 'initial' ? 0 : Math.floor(Date.now() / 1000),
    status: input.revision === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
  });
}

/** A one-click "add to calendar" link for Gmail/Google Calendar users, who
 *  don't reliably get an inline prompt from a plain .ics attachment. */
export function googleCalendarUrl(event: {
  title: string; start: Date; end: Date; location?: string; description?: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(event.start)}/${fmt(event.end)}`,
    ...(event.location ? { location: event.location } : {}),
    ...(event.description ? { details: event.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
