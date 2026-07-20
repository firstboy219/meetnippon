/**
 * Per-tenant timezone helpers.
 *
 * Instants are always stored as real UTC (Prisma DateTime). These helpers
 * answer "what does this instant look like on the tenant's wall clock?", which
 * is what business-hours, weekday and per-day quota checks actually mean.
 *
 * Implemented on Intl (full ICU ships with Node 13+), so no tz database
 * dependency is added.
 */

const PARTS_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = PARTS_FMT_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    PARTS_FMT_CACHE.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock field values of `instant` as seen in `tz`. */
export function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 in some ICU versions; normalise to 0.
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) to add to a UTC instant to get the tenant's wall clock. */
export function tzOffsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second noise so the difference is a clean offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** ISO weekday (1=Mon … 7=Sun) of `instant` on the tenant's wall clock. */
export function isoWeekdayInTz(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  // Build a UTC date from the local field values, then read its weekday.
  const wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Minutes since local midnight on the tenant's wall clock. */
export function minuteOfDayInTz(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  return p.hour * 60 + p.minute;
}

/** Local calendar date of `instant` in `tz`, as "YYYY-MM-DD". */
export function localDateKey(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The UTC instant of local midnight for the day `instant` falls on in `tz`.
 *
 * Two-pass: the first guess uses the offset at `instant`, which can be wrong
 * when a DST transition sits between midnight and `instant`; re-reading the
 * offset at the guess corrects it.
 */
export function startOfDayInTz(instant: Date, tz: string): Date {
  const p = zonedParts(instant, tz);
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  let guess = new Date(localMidnightAsUtc - tzOffsetMs(instant, tz));
  const corrected = new Date(localMidnightAsUtc - tzOffsetMs(guess, tz));
  // If the correction lands on a different local day the zone skipped midnight
  // (DST spring-forward); keep the first guess in that case.
  if (localDateKey(corrected, tz) === localDateKey(instant, tz)) guess = corrected;
  return guess;
}

/** Add `days` calendar days to a local-midnight instant, DST-safe. */
export function addLocalDays(dayStart: Date, days: number, tz: string): Date {
  const p = zonedParts(dayStart, tz);
  const target = Date.UTC(p.year, p.month - 1, p.day + days);
  const guess = new Date(target - tzOffsetMs(dayStart, tz));
  return new Date(target - tzOffsetMs(guess, tz));
}
