// Instants are real UTC ISO strings (API contract); they are rendered on the
// tenant's wall clock, which is set once from branding via setTenantTz().

let tenantTz = 'UTC';

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function setTenantTz(tz: string | null | undefined): void {
  if (tz && isValidTz(tz)) tenantTz = tz;
}

export function getTenantTz(): string {
  return tenantTz;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: getTenantTz() });
}
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: getTenantTz() });
}
export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

/** Calendar day of an instant on the given zone's wall clock, as 'YYYY-MM-DD'. */
export function localDateKey(iso: string, tz: string = getTenantTz()): string {
  // 'en-CA' yields ISO-shaped dates (YYYY-MM-DD).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: isValidTz(tz) ? tz : 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

/** Today's date on the tenant's wall clock, as 'YYYY-MM-DD'. */
export function todayLocal(tz: string = getTenantTz()): string {
  return localDateKey(new Date().toISOString(), tz);
}

/**
 * Offset of `tz` at the instant `utcMs`, in ms (wall clock minus UTC).
 * Derived by formatting the instant in `tz` and diffing against the UTC fields.
 */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') f[p.type] = Number(p.value);
  // hour12:false can render midnight as hour 24 in some engines.
  const hour = f.hour === 24 ? 0 : f.hour;
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, hour, f.minute, f.second);
  return asUtc - utcMs;
}

/**
 * Convert a wall-clock date + time in `tz` to a real UTC ISO string.
 * The offset is resolved iteratively so DST transitions land correctly.
 */
export function zonedToUtcIso(dateStr: string, timeStr: string, tz: string = getTenantTz()): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const wall = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  if (!isValidTz(tz)) return new Date(wall).toISOString();

  // First pass uses the offset at the wall-clock instant; the second pass
  // re-reads it at the candidate instant so DST boundaries resolve.
  let utcMs = wall - tzOffsetMs(wall, tz);
  utcMs = wall - tzOffsetMs(utcMs, tz);
  return new Date(utcMs).toISOString();
}

/**
 * Short display name for a zone, e.g. "WIB" or "GMT+9".
 * Formatted with id-ID because it is the only locale that names the Indonesian
 * zones properly (WIB/WITA/WIT); it falls back to GMT offsets elsewhere, which
 * matches what en-GB would have shown anyway.
 */
export function tzLabel(tz: string = getTenantTz()): string {
  if (!isValidTz(tz)) return tz;
  const parts = new Intl.DateTimeFormat('id-ID', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}
