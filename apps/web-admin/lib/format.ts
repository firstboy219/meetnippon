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
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: getTenantTz() });
}
export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
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

/** Short display name for a zone, e.g. "WIB" or "GMT+7". */
export function tzLabel(tz: string = getTenantTz()): string {
  if (!isValidTz(tz)) return tz;
  // id-ID is the only locale that names the Indonesian zones (WIB/WITA/WIT).
  const parts = new Intl.DateTimeFormat('id-ID', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date());
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}
