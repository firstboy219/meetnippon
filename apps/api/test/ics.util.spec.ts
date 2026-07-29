import { buildIcs, googleCalendarUrl } from '../src/mail/ics.util';

describe('buildIcs', () => {
  const base = {
    uid: 'abc123@meetnippon.example',
    title: 'Weekly sync',
    location: 'Bee Brand · Level 5',
    start: new Date('2026-08-21T01:00:00.000Z'),
    end: new Date('2026-08-21T01:30:00.000Z'),
  };

  it('produces a well-formed single-event calendar', () => {
    const ics = buildIcs(base);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc123@meetnippon.example');
    expect(ics).toContain('DTSTART:20260821T010000Z');
    expect(ics).toContain('DTEND:20260821T013000Z');
    expect(ics).toContain('SUMMARY:Weekly sync');
    expect(ics).toContain('LOCATION:Bee Brand · Level 5');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('escapes text fields with commas, semicolons, and newlines', () => {
    const ics = buildIcs({ ...base, title: 'Budget; Q3, review\nfollow-up' });
    expect(ics).toContain('SUMMARY:Budget\\; Q3\\, review\\nfollow-up');
  });

  it('includes organizer and attendees as mailto URIs', () => {
    const ics = buildIcs({
      ...base, organizerEmail: 'admin@nipsea.co.id', organizerName: 'Nipsea Admin',
      attendeeEmails: ['a@nipseapaint.com', 'b@nipseapaint.com'],
    });
    expect(ics).toContain('ORGANIZER;CN=Nipsea Admin:mailto:admin@nipsea.co.id');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:a@nipseapaint.com');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:b@nipseapaint.com');
  });

  it('switches to a CANCEL method and CANCELLED status', () => {
    const ics = buildIcs({ ...base, status: 'CANCELLED' });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('keeps the same UID across a reschedule, with a bumped sequence', () => {
    const original = buildIcs({ ...base, sequence: 0 });
    const moved = buildIcs({ ...base, start: new Date('2026-08-22T01:00:00.000Z'), sequence: 1 });
    const uidOf = (s: string) => s.match(/UID:(.+)/)?.[1];
    expect(uidOf(moved)).toBe(uidOf(original));
    expect(moved).toContain('SEQUENCE:1');
  });
});

describe('googleCalendarUrl', () => {
  it('builds a quick-add TEMPLATE link with the event encoded', () => {
    const url = googleCalendarUrl({
      title: 'Weekly sync', location: 'Bee Brand',
      start: new Date('2026-08-21T01:00:00.000Z'), end: new Date('2026-08-21T01:30:00.000Z'),
    });
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('action')).toBe('TEMPLATE');
    expect(params.get('text')).toBe('Weekly sync');
    expect(params.get('dates')).toBe('20260821T010000Z/20260821T013000Z');
    expect(params.get('location')).toBe('Bee Brand');
  });
});
