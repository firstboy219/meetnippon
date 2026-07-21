/**
 * Effective presence.
 *
 * The stored `presence` column cannot be trusted on its own: someone who closes
 * their laptop leaves it reading AVAILABLE forever. What another user should see
 * is *derived* — from recent activity, from whether the person is in a meeting
 * right now, and from any manual override they set.
 */

export type Presence = 'AVAILABLE' | 'BUSY' | 'DND' | 'AWAY' | 'OFFLINE';

/** No heartbeat for this long and the person is idle rather than at their desk. */
export const IDLE_AFTER_MIN = 5;
/** No heartbeat for this long and they are gone, not merely idle. */
export const OFFLINE_AFTER_MIN = 30;

export interface PresenceInput {
  /** What is stored on the user row. */
  stored: Presence;
  /** True when the user picked a status themselves. */
  manual: boolean;
  /** Admin-pinned status that a heartbeat must not move. */
  locked?: boolean;
  lastSeenAt: Date | null;
  /** True when a booking they own is running right now. */
  inMeeting: boolean;
  now?: Date;
}

export interface PresenceView {
  presence: Presence;
  /** Whether this came from the user's own choice rather than activity. */
  manual: boolean;
  /** Set when the reason is worth showing, e.g. "in a meeting". */
  reason: 'meeting' | 'idle' | 'offline' | 'manual' | 'active' | null;
}

/**
 * Order of precedence, most authoritative first:
 *  1. an admin lock,
 *  2. the user's own choice — but only while they are still around; a manual
 *     "Available" must not outlive the session that set it,
 *  3. a meeting happening right now,
 *  4. plain activity.
 */
export function effectivePresence(input: PresenceInput): PresenceView {
  const now = input.now ?? new Date();
  const sinceSeen = input.lastSeenAt
    ? (now.getTime() - new Date(input.lastSeenAt).getTime()) / 60_000
    : Infinity;
  const gone = sinceSeen >= OFFLINE_AFTER_MIN;

  if (input.locked) {
    return { presence: input.stored, manual: true, reason: 'manual' };
  }

  // A manual choice survives idleness but not disappearance — otherwise a
  // colleague who set "Available" on Friday still looks available on Monday.
  if (input.manual && !gone) {
    return { presence: input.stored, manual: true, reason: 'manual' };
  }

  if (gone) return { presence: 'OFFLINE', manual: false, reason: 'offline' };

  // "On meet": derived from the calendar, so it is right even if the person
  // never touches the app during the meeting.
  if (input.inMeeting) return { presence: 'BUSY', manual: false, reason: 'meeting' };

  if (sinceSeen >= IDLE_AFTER_MIN) return { presence: 'AWAY', manual: false, reason: 'idle' };

  return { presence: 'AVAILABLE', manual: false, reason: 'active' };
}

const VALID: Presence[] = ['AVAILABLE', 'BUSY', 'DND', 'AWAY', 'OFFLINE'];

/** Parse a client-supplied status; 'AUTO' means "stop overriding". */
export function parsePresenceChoice(v: string): Presence | 'AUTO' | null {
  const s = (v ?? '').trim().toUpperCase();
  if (s === 'AUTO') return 'AUTO';
  return (VALID as string[]).includes(s) ? (s as Presence) : null;
}
