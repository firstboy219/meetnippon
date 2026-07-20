/**
 * Pure booking-rule helpers (no DB) — unit tested in isolation.
 *
 * TIME MODEL: instants are real UTC; business-hours and weekday comparisons are
 * evaluated on the tenant's wall clock (`tz`, an IANA zone). Callers that have
 * no tenant context may pass 'UTC' for the previous behaviour.
 */
import { PolicyRules } from './policy/policy.types';
import { isoWeekdayInTz, minuteOfDayInTz, tzOffsetMs, zonedParts } from '../common/tz.util';

export interface Slot {
  start: Date;
  end: Date;
}

export interface Recurrence {
  freq: 'DAILY' | 'WEEKLY';
  count: number;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/** ISO weekday 1=Mon … 7=Sun on the tenant's wall clock. */
export function isoWeekday(d: Date, tz = 'UTC'): number {
  return isoWeekdayInTz(d, tz);
}

/** Minutes since local midnight on the tenant's wall clock. */
function minuteOfDay(d: Date, tz: string): number {
  return minuteOfDayInTz(d, tz);
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Expand a base slot into recurring occurrences (inclusive of the base).
 * Steps by calendar days on the tenant's wall clock, so an occurrence keeps its
 * local start time across a DST transition rather than drifting an hour.
 */
export function generateOccurrences(base: Slot, recurrence?: Recurrence, tz = 'UTC'): Slot[] {
  if (!recurrence) return [base];
  const stepDays = recurrence.freq === 'WEEKLY' ? 7 : 1;
  const durationMs = base.end.getTime() - base.start.getTime();
  const out: Slot[] = [];
  for (let i = 0; i < recurrence.count; i++) {
    const start = shiftLocalDays(base.start, i * stepDays, tz);
    out.push({ start, end: new Date(start.getTime() + durationMs) });
  }
  return out;
}

/** Same wall-clock time, `days` calendar days later in `tz`. */
function shiftLocalDays(instant: Date, days: number, tz: string): Date {
  if (days === 0) return instant;
  const p = zonedParts(instant, tz);
  const target = Date.UTC(p.year, p.month - 1, p.day + days, p.hour, p.minute, p.second);
  const guess = new Date(target - tzOffsetMs(instant, tz));
  return new Date(target - tzOffsetMs(guess, tz));
}

/** True when the slot fits entirely inside the allowed business hours/day. */
export function withinBusinessHours(slot: Slot, rules: PolicyRules, tz = 'UTC'): boolean {
  const bh = rules.businessHours;
  if (!bh) return true;
  if (isoWeekday(slot.start, tz) !== isoWeekday(slot.end, tz)) return false; // no cross-day
  if (!bh.days.includes(isoWeekday(slot.start, tz))) return false;
  const open = parseHHMM(bh.start);
  const close = parseHHMM(bh.end);
  return minuteOfDay(slot.start, tz) >= open && minuteOfDay(slot.end, tz) <= close;
}

/**
 * Validate a single slot against the resolved rules (excluding conflict &
 * per-user quota, which need the DB). Returns an error message or null.
 */
export function validateSlot(slot: Slot, rules: PolicyRules, now: Date, tz = 'UTC'): string | null {
  if (!(slot.start instanceof Date) || isNaN(slot.start.getTime())) return 'Invalid start time.';
  if (!(slot.end instanceof Date) || isNaN(slot.end.getTime())) return 'Invalid end time.';
  if (slot.end <= slot.start) return 'End time must be after start time.';

  const duration = minutesBetween(slot.start, slot.end);
  if (duration < rules.minDurationMinutes) {
    return `Duration must be at least ${rules.minDurationMinutes} minutes.`;
  }
  if (duration > rules.maxDurationMinutes) {
    return `Duration must not exceed ${rules.maxDurationMinutes} minutes.`;
  }

  const leadMinutes = minutesBetween(now, slot.start);
  if (leadMinutes < rules.minAdvanceMinutes) {
    return `Must be booked at least ${rules.minAdvanceMinutes} minutes ahead.`;
  }
  const maxAdvanceMs = rules.maxAdvanceDays * 24 * 60 * 60 * 1000;
  if (slot.start.getTime() - now.getTime() > maxAdvanceMs) {
    return `Cannot book more than ${rules.maxAdvanceDays} days ahead.`;
  }

  if (!withinBusinessHours(slot, rules, tz)) {
    return 'Outside allowed business hours.';
  }
  return null;
}
