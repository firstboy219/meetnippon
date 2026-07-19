// Times are UTC wall-clock (API contract); render in UTC for consistency.
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
export function sameUtcDay(iso: string, ymd: string): boolean {
  return iso.slice(0, 10) === ymd;
}
