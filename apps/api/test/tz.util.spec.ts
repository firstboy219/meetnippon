import {
  addLocalDays,
  isValidTimeZone,
  isoWeekdayInTz,
  localDateKey,
  localDateOnly,
  minuteOfDayInTz,
  startOfDayInTz,
  zonedParts,
} from '../src/common/tz.util';
import { generateOccurrences, withinBusinessHours } from '../src/booking/booking.rules';
import { DEFAULT_RULES } from '../src/booking/policy/policy.types';

const JKT = 'Asia/Jakarta'; // UTC+7, no DST
const NY = 'America/New_York'; // DST, for the tricky cases

describe('localDateOnly — what a DATE column must be given', () => {
  /*
   * The bug this guards: storing startOfDayInTz() into a `@db.Date` column.
   * For Asia/Jakarta local midnight is 17:00 UTC the previous day, and Postgres
   * truncates that to the previous date — so every work-location day was
   * recorded one day early.
   */
  it('keeps the local calendar date for a tenant ahead of UTC', () => {
    // 22:19 on 21 Jul in Jakarta is still 15:19 on 21 Jul UTC
    const evening = new Date('2026-07-21T15:19:00.000Z');
    expect(localDateKey(evening, JKT)).toBe('2026-07-21');
    expect(localDateOnly(evening, JKT).toISOString()).toBe('2026-07-21T00:00:00.000Z');
    // the instant-based helper is the one that would have truncated wrongly
    expect(startOfDayInTz(evening, JKT).toISOString()).toBe('2026-07-20T17:00:00.000Z');
  });

  it('is right just after local midnight, when UTC is still the day before', () => {
    // 00:30 on 22 Jul in Jakarta = 17:30 on 21 Jul UTC
    const justAfterMidnight = new Date('2026-07-21T17:30:00.000Z');
    expect(localDateOnly(justAfterMidnight, JKT).toISOString()).toBe('2026-07-22T00:00:00.000Z');
  });

  it('is right for a tenant behind UTC, where local is still yesterday', () => {
    // 20:00 on 21 Jul in New York = 00:00 on 22 Jul UTC
    const evening = new Date('2026-07-22T00:00:00.000Z');
    expect(localDateKey(evening, NY)).toBe('2026-07-21');
    expect(localDateOnly(evening, NY).toISOString()).toBe('2026-07-21T00:00:00.000Z');
  });

  it('always lands on exact UTC midnight, so a DATE column stores it verbatim', () => {
    for (const iso of ['2026-01-01T00:00:00.000Z', '2026-07-21T15:19:00.000Z', '2026-12-31T23:59:59.000Z']) {
      for (const tz of [JKT, NY, 'UTC']) {
        const d = localDateOnly(new Date(iso), tz);
        expect(d.getUTCHours()).toBe(0);
        expect(d.getUTCMinutes()).toBe(0);
        expect(d.getUTCSeconds()).toBe(0);
      }
    }
  });
});

describe('tz.util', () => {
  it('validates IANA zones', () => {
    expect(isValidTimeZone(JKT)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('reads wall-clock parts in the tenant zone', () => {
    // 2026-03-10T02:30Z is 09:30 the same day in Jakarta
    const p = zonedParts(new Date('2026-03-10T02:30:00Z'), JKT);
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 3, 10, 9, 30]);
  });

  it('normalises midnight to hour 0, not 24', () => {
    // 17:00Z = 00:00 next day in Jakarta
    const p = zonedParts(new Date('2026-03-09T17:00:00Z'), JKT);
    expect(p.hour).toBe(0);
    expect(p.day).toBe(10);
    expect(minuteOfDayInTz(new Date('2026-03-09T17:00:00Z'), JKT)).toBe(0);
  });

  it('computes minute-of-day and weekday on the local clock', () => {
    const d = new Date('2026-07-20T01:15:00Z'); // Mon 08:15 WIB
    expect(minuteOfDayInTz(d, JKT)).toBe(8 * 60 + 15);
    expect(isoWeekdayInTz(d, JKT)).toBe(1);
    // Same instant is still Sunday in UTC-ish terms? No — 01:15Z Monday.
    expect(isoWeekdayInTz(d, 'UTC')).toBe(1);
  });

  it('rolls the weekday over at local midnight, not UTC midnight', () => {
    // Sunday 22:00Z is already Monday 05:00 in Jakarta
    const d = new Date('2026-07-19T22:00:00Z');
    expect(isoWeekdayInTz(d, 'UTC')).toBe(7);
    expect(isoWeekdayInTz(d, JKT)).toBe(1);
  });

  it('startOfDayInTz returns the UTC instant of local midnight', () => {
    const d = new Date('2026-07-20T03:00:00Z'); // 10:00 WIB Mon
    const start = startOfDayInTz(d, JKT);
    expect(start.toISOString()).toBe('2026-07-19T17:00:00.000Z');
    expect(localDateKey(start, JKT)).toBe('2026-07-20');
  });

  it('startOfDayInTz is idempotent', () => {
    const d = new Date('2026-07-20T03:00:00Z');
    const once = startOfDayInTz(d, JKT);
    expect(startOfDayInTz(once, JKT).toISOString()).toBe(once.toISOString());
  });

  it('handles a DST spring-forward day', () => {
    // 2026-03-08 is the US spring-forward date; local midnight still exists.
    const d = new Date('2026-03-08T18:00:00Z');
    const start = startOfDayInTz(d, NY);
    expect(localDateKey(start, NY)).toBe('2026-03-08');
    expect(zonedParts(start, NY).hour).toBe(0);
  });

  it('handles a DST fall-back day', () => {
    const d = new Date('2026-11-01T18:00:00Z');
    const start = startOfDayInTz(d, NY);
    expect(localDateKey(start, NY)).toBe('2026-11-01');
    expect(zonedParts(start, NY).hour).toBe(0);
  });

  it('addLocalDays crosses a DST boundary as one calendar day', () => {
    // The 2026 US spring-forward is 02:00 on Mar 8, so Mar 8 is a 23-hour day.
    const start = startOfDayInTz(new Date('2026-03-08T18:00:00Z'), NY);
    const next = addLocalDays(start, 1, NY);
    expect(localDateKey(next, NY)).toBe('2026-03-09');
    expect(zonedParts(next, NY).hour).toBe(0);
    expect(next.getTime() - start.getTime()).toBe(23 * 3600000);
  });

  it('addLocalDays over a normal day is exactly 24h', () => {
    const start = startOfDayInTz(new Date('2026-07-20T03:00:00Z'), JKT);
    const next = addLocalDays(start, 1, JKT);
    expect(localDateKey(next, JKT)).toBe('2026-07-21');
    expect(next.getTime() - start.getTime()).toBe(24 * 3600000);
  });
});

describe('booking rules with tenant timezone', () => {
  const rules = {
    ...DEFAULT_RULES,
    businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  };

  it('accepts a slot inside local business hours that is outside UTC hours', () => {
    // 02:00–03:00Z = 09:00–10:00 WIB on a Monday
    const slot = { start: new Date('2026-07-20T02:00:00Z'), end: new Date('2026-07-20T03:00:00Z') };
    expect(withinBusinessHours(slot, rules, JKT)).toBe(true);
    expect(withinBusinessHours(slot, rules, 'UTC')).toBe(false); // 02:00 UTC is before 08:00
  });

  it('rejects a slot that is inside UTC hours but outside local hours', () => {
    // 12:00–13:00Z = 19:00–20:00 WIB, past the 18:00 close
    const slot = { start: new Date('2026-07-20T12:00:00Z'), end: new Date('2026-07-20T13:00:00Z') };
    expect(withinBusinessHours(slot, rules, 'UTC')).toBe(true);
    expect(withinBusinessHours(slot, rules, JKT)).toBe(false);
  });

  it('rejects a slot on a locally-excluded weekday', () => {
    // Fri 22:00Z is Sat 05:00 WIB — a weekend locally
    const slot = { start: new Date('2026-07-24T22:00:00Z'), end: new Date('2026-07-24T23:00:00Z') };
    expect(withinBusinessHours(slot, rules, JKT)).toBe(false);
  });

  it('recurrence keeps the local start time across a DST shift', () => {
    const base = {
      start: new Date('2026-03-07T14:00:00Z'), // 09:00 EST Sat
      end: new Date('2026-03-07T15:00:00Z'),
    };
    const [first, second] = generateOccurrences(base, { freq: 'DAILY', count: 2 }, NY);
    expect(zonedParts(first.start, NY).hour).toBe(9);
    expect(zonedParts(second.start, NY).hour).toBe(9); // still 09:00 local, not 10:00
    expect(second.end.getTime() - second.start.getTime()).toBe(3600000);
  });

  it('defaults to UTC when no zone is given (previous behaviour)', () => {
    const slot = { start: new Date('2026-07-20T09:00:00Z'), end: new Date('2026-07-20T10:00:00Z') };
    expect(withinBusinessHours(slot, rules)).toBe(true);
  });
});
