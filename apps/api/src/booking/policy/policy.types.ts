/**
 * Booking rule schema + 3-level resolver (BRD 7.3).
 *
 * Policies are stored as jsonb on BookingPolicy.rules at three scopes:
 *   TENANT (baseline) <- CATEGORY (per resource.category) <- ROOM (per resource.id)
 * The resolver merges them in that order; a more specific scope overrides a key
 * it defines, and leaves undefined keys to the broader scope (BRD 7.3.1–7.3.6).
 */

export interface BusinessHours {
  /** "HH:mm" 24h local */
  start: string;
  /** "HH:mm" 24h local */
  end: string;
  /** ISO weekdays allowed, 1=Mon … 7=Sun */
  days: number[];
}

export interface PolicyRules {
  minDurationMinutes: number;
  maxDurationMinutes: number;
  /** must book at least this far ahead of start */
  minAdvanceMinutes: number;
  /** cannot book further than this many days ahead */
  maxAdvanceDays: number;
  /** required empty gap before & after each booking on the same resource */
  bufferMinutes: number;
  businessHours: BusinessHours;
  requiresApproval: boolean;
  /** explicit level-1 approver user ids; empty => any tenant APPROVER/ADMIN */
  approverIds: string[];
  /** 0 = unlimited */
  maxBookingsPerUserPerDay: number;
  allowExternalParticipants: boolean;
  allowRecurring: boolean;
  checkInRequired: boolean;
  /** release the slot if not checked-in within N min of start (0 = never) */
  autoReleaseMinutes: number;
}

/** Tenant-level safe defaults applied beneath every resolved policy. */
export const DEFAULT_RULES: PolicyRules = {
  minDurationMinutes: 15,
  maxDurationMinutes: 480,
  minAdvanceMinutes: 0,
  maxAdvanceDays: 90,
  bufferMinutes: 0,
  businessHours: { start: '00:00', end: '23:59', days: [1, 2, 3, 4, 5, 6, 7] },
  requiresApproval: false,
  approverIds: [],
  maxBookingsPerUserPerDay: 0,
  allowExternalParticipants: true,
  allowRecurring: true,
  checkInRequired: false,
  autoReleaseMinutes: 0,
};

/** Only keys present (not undefined) in an override are applied. */
function applyOverride(base: PolicyRules, override: Partial<PolicyRules> | null | undefined): PolicyRules {
  if (!override) return base;
  const out: PolicyRules = { ...base };
  (Object.keys(override) as (keyof PolicyRules)[]).forEach((k) => {
    const v = override[k];
    if (v !== undefined && v !== null) {
      (out as any)[k] = v;
    }
  });
  return out;
}

/**
 * Merge rule layers, broad → specific. Later layers win per-key.
 * Pure function — unit tested without a database.
 */
export function mergeRules(...layers: (Partial<PolicyRules> | null | undefined)[]): PolicyRules {
  return layers.reduce<PolicyRules>(
    (acc, layer) => applyOverride(acc, layer),
    DEFAULT_RULES,
  );
}
