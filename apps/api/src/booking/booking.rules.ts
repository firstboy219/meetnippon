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
 *
 * `allowedDays` (ISO weekday 1=Mon…7=Sun, from the resolved business-hours
 * policy) is only meaningful for DAILY: "every day" means every day the room
 * is open, so a day the policy excludes (e.g. Sunday closed) is skipped
 * rather than generated and then rejected by withinBusinessHours() — that
 * used to fail the whole create() call even though the picked slot itself
 * was free and valid. WEEKLY always lands on the same weekday as the base,
 * which was already chosen from a day the picker offered, so it needs no
 * skipping.
 */
export function generateOccurrences(
  base: Slot, recurrence?: Recurrence, tz = 'UTC', allowedDays?: number[],
): Slot[] {
  if (!recurrence) return [base];
  const durationMs = base.end.getTime() - base.start.getTime();
  const out: Slot[] = [];
  if (recurrence.freq === 'WEEKLY') {
    for (let i = 0; i < recurrence.count; i++) {
      const start = shiftLocalDays(base.start, i * 7, tz);
      out.push({ start, end: new Date(start.getTime() + durationMs) });
    }
    return out;
  }
  // DAILY — walk forward one calendar day at a time, skipping any weekday
  // the policy does not allow, until `count` occurrences are collected. The
  // guard bounds the walk even if `allowedDays` were ever empty.
  const maxSteps = recurrence.count * 14 + 60;
  for (let day = 0, found = 0; found < recurrence.count && day < maxSteps; day += 1) {
    const start = shiftLocalDays(base.start, day, tz);
    if (allowedDays && !allowedDays.includes(isoWeekday(start, tz))) continue;
    out.push({ start, end: new Date(start.getTime() + durationMs) });
    found += 1;
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

/** True when the slot starts beyond the policy's booking horizon. */
export function exceedsMaxAdvance(slot: Slot, rules: PolicyRules, now: Date): boolean {
  return slot.start.getTime() - now.getTime() > rules.maxAdvanceDays * 24 * 60 * 60 * 1000;
}

/**
 * Validate a single slot against the resolved rules (excluding conflict &
 * per-user quota, which need the DB). Returns an error message or null.
 *
 * `allowOverAdvance` lets the caller accept a slot beyond the booking horizon —
 * used when the admin has configured over-horizon bookings to go through
 * approval instead of being refused.
 */
export function validateSlot(
  slot: Slot,
  rules: PolicyRules,
  now: Date,
  tz = 'UTC',
  opts: { allowOverAdvance?: boolean } = {},
): string | null {
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
  if (!opts.allowOverAdvance && exceedsMaxAdvance(slot, rules, now)) {
    return `Cannot book more than ${rules.maxAdvanceDays} days ahead.`;
  }

  if (!withinBusinessHours(slot, rules, tz)) {
    return 'Outside allowed business hours.';
  }
  return null;
}
