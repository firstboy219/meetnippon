/**
 * Pure booking-rule helpers (no DB) — unit tested in isolation.
 *
 * TIME MODEL (Phase 2): all times are treated as UTC wall-clock. Per-tenant
 * timezone handling is a later hardening item; business-hours comparisons use
 * UTC hours/day so tests are deterministic.
 */
import { PolicyRules } from './policy/policy.types';

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

/** ISO weekday 1=Mon … 7=Sun for a Date (UTC). */
export function isoWeekday(d: Date): number {
  const wd = d.getUTCDay(); // 0=Sun … 6=Sat
  return wd === 0 ? 7 : wd;
}

/** Minutes since 00:00 UTC. */
function minuteOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Expand a base slot into recurring occurrences (inclusive of the base). */
export function generateOccurrences(base: Slot, recurrence?: Recurrence): Slot[] {
  if (!recurrence) return [base];
  const stepDays = recurrence.freq === 'WEEKLY' ? 7 : 1;
  const out: Slot[] = [];
  for (let i = 0; i < recurrence.count; i++) {
    const offsetMs = i * stepDays * 24 * 60 * 60 * 1000;
    out.push({
      start: new Date(base.start.getTime() + offsetMs),
      end: new Date(base.end.getTime() + offsetMs),
    });
  }
  return out;
}

/** True when the slot fits entirely inside the allowed business hours/day. */
export function withinBusinessHours(slot: Slot, rules: PolicyRules): boolean {
  const bh = rules.businessHours;
  if (!bh) return true;
  if (isoWeekday(slot.start) !== isoWeekday(slot.end)) return false; // no cross-day
  if (!bh.days.includes(isoWeekday(slot.start))) return false;
  const open = parseHHMM(bh.start);
  const close = parseHHMM(bh.end);
  return minuteOfDay(slot.start) >= open && minuteOfDay(slot.end) <= close;
}

/**
 * Validate a single slot against the resolved rules (excluding conflict &
 * per-user quota, which need the DB). Returns an error message or null.
 */
export function validateSlot(slot: Slot, rules: PolicyRules, now: Date): string | null {
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

  if (!withinBusinessHours(slot, rules)) {
    return 'Outside allowed business hours.';
  }
  return null;
}
