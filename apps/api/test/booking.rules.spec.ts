import { mergeRules, DEFAULT_RULES } from '../src/booking/policy/policy.types';
import {
  validateSlot,
  withinBusinessHours,
  generateOccurrences,
  isoWeekday,
} from '../src/booking/booking.rules';

describe('policy merge (BRD 7.3 — TENANT <- CATEGORY <- ROOM)', () => {
  it('applies defaults when no layers given', () => {
    expect(mergeRules()).toEqual(DEFAULT_RULES);
  });

  it('more specific scope overrides broader scope per-key', () => {
    const merged = mergeRules(
      { maxDurationMinutes: 240, requiresApproval: true }, // TENANT
      { maxDurationMinutes: 120 }, // CATEGORY overrides duration
      { requiresApproval: false, bufferMinutes: 15 }, // ROOM overrides approval + buffer
    );
    expect(merged.maxDurationMinutes).toBe(120); // category won over tenant
    expect(merged.requiresApproval).toBe(false); // room won over tenant
    expect(merged.bufferMinutes).toBe(15); // room-only
    expect(merged.minDurationMinutes).toBe(DEFAULT_RULES.minDurationMinutes); // default falls through
  });

  it('ignores undefined/null keys in an override', () => {
    const merged = mergeRules({ maxDurationMinutes: 300 }, { maxDurationMinutes: undefined });
    expect(merged.maxDurationMinutes).toBe(300);
  });
});

describe('validateSlot', () => {
  const now = new Date('2026-07-20T08:00:00Z');
  const rules = { ...DEFAULT_RULES, minDurationMinutes: 30, maxDurationMinutes: 120, minAdvanceMinutes: 60, maxAdvanceDays: 30 };

  it('accepts a valid slot', () => {
    const slot = { start: new Date('2026-07-20T10:00:00Z'), end: new Date('2026-07-20T11:00:00Z') };
    expect(validateSlot(slot, rules, now)).toBeNull();
  });

  it('rejects too-short and too-long durations', () => {
    expect(validateSlot({ start: new Date('2026-07-20T10:00:00Z'), end: new Date('2026-07-20T10:15:00Z') }, rules, now)).toMatch(/at least/);
    expect(validateSlot({ start: new Date('2026-07-20T10:00:00Z'), end: new Date('2026-07-20T13:00:00Z') }, rules, now)).toMatch(/not exceed/);
  });

  it('enforces min advance and max advance window', () => {
    expect(validateSlot({ start: new Date('2026-07-20T08:30:00Z'), end: new Date('2026-07-20T09:15:00Z') }, rules, now)).toMatch(/ahead/);
    expect(validateSlot({ start: new Date('2026-09-30T10:00:00Z'), end: new Date('2026-09-30T10:45:00Z') }, rules, now)).toMatch(/days ahead/);
  });

  it('rejects end before start', () => {
    expect(validateSlot({ start: new Date('2026-07-20T11:00:00Z'), end: new Date('2026-07-20T10:00:00Z') }, rules, now)).toMatch(/after start/);
  });
});

describe('withinBusinessHours', () => {
  const slot = { start: new Date('2026-07-20T09:00:00Z'), end: new Date('2026-07-20T10:00:00Z') }; // a Monday
  it('accepts inside the window on an allowed day', () => {
    const wd = isoWeekday(slot.start);
    const rules = { ...DEFAULT_RULES, businessHours: { start: '08:00', end: '18:00', days: [wd] } };
    expect(withinBusinessHours(slot, rules)).toBe(true);
  });
  it('rejects a disallowed weekday', () => {
    const wd = isoWeekday(slot.start);
    const other = wd === 7 ? 1 : wd + 1;
    const rules = { ...DEFAULT_RULES, businessHours: { start: '08:00', end: '18:00', days: [other] } };
    expect(withinBusinessHours(slot, rules)).toBe(false);
  });
  it('rejects outside the hour window', () => {
    const wd = isoWeekday(slot.start);
    const rules = { ...DEFAULT_RULES, businessHours: { start: '10:00', end: '18:00', days: [wd] } };
    expect(withinBusinessHours(slot, rules)).toBe(false);
  });
});

describe('generateOccurrences', () => {
  const base = { start: new Date('2026-07-20T10:00:00Z'), end: new Date('2026-07-20T11:00:00Z') };
  it('returns just the base when no recurrence', () => {
    expect(generateOccurrences(base)).toHaveLength(1);
  });
  it('expands weekly occurrences 7 days apart', () => {
    const occ = generateOccurrences(base, { freq: 'WEEKLY', count: 3 });
    expect(occ).toHaveLength(3);
    expect(occ[1].start.toISOString()).toBe('2026-07-27T10:00:00.000Z');
    expect(occ[2].start.toISOString()).toBe('2026-08-03T10:00:00.000Z');
  });
  it('expands daily occurrences 1 day apart', () => {
    const occ = generateOccurrences(base, { freq: 'DAILY', count: 2 });
    expect(occ[1].start.toISOString()).toBe('2026-07-21T10:00:00.000Z');
  });
});
