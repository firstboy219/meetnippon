/**
 * Effective presence. Pure — no database.
 *
 * These rules decide what colleagues see about each other, so the precedence
 * between "I set this myself", "they are in a meeting" and "they went home"
 * is worth pinning down explicitly.
 */
import {
  effectivePresence, parsePresenceChoice, IDLE_AFTER_MIN, OFFLINE_AFTER_MIN,
} from '../src/presence/presence.util';

const NOW = new Date('2026-07-21T10:00:00.000Z');
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const base = {
  stored: 'AVAILABLE' as const,
  manual: false,
  locked: false,
  lastSeenAt: minsAgo(1),
  inMeeting: false,
  now: NOW,
};

describe('automatic presence', () => {
  it('is available while the heartbeat is recent', () => {
    expect(effectivePresence(base)).toMatchObject({ presence: 'AVAILABLE', reason: 'active' });
  });

  it('goes idle after the idle threshold', () => {
    expect(effectivePresence({ ...base, lastSeenAt: minsAgo(IDLE_AFTER_MIN + 1) }))
      .toMatchObject({ presence: 'AWAY', reason: 'idle' });
  });

  it('goes offline after the offline threshold', () => {
    expect(effectivePresence({ ...base, lastSeenAt: minsAgo(OFFLINE_AFTER_MIN + 1) }))
      .toMatchObject({ presence: 'OFFLINE', reason: 'offline' });
  });

  it('treats a user who has never been seen as offline', () => {
    expect(effectivePresence({ ...base, lastSeenAt: null }))
      .toMatchObject({ presence: 'OFFLINE', reason: 'offline' });
  });

  it('shows busy while a meeting is running, without anyone setting it', () => {
    expect(effectivePresence({ ...base, inMeeting: true }))
      .toMatchObject({ presence: 'BUSY', reason: 'meeting', manual: false });
  });

  it('prefers the meeting over idleness', () => {
    // In a meeting and not touching the app is the normal case — it must not
    // read as "idle".
    expect(effectivePresence({ ...base, inMeeting: true, lastSeenAt: minsAgo(IDLE_AFTER_MIN + 2) }))
      .toMatchObject({ presence: 'BUSY', reason: 'meeting' });
  });
});

describe('manual override', () => {
  it('wins over activity and over a meeting', () => {
    expect(effectivePresence({ ...base, manual: true, stored: 'DND', inMeeting: true }))
      .toMatchObject({ presence: 'DND', manual: true, reason: 'manual' });
  });

  it('survives going idle', () => {
    expect(effectivePresence({ ...base, manual: true, stored: 'BUSY', lastSeenAt: minsAgo(IDLE_AFTER_MIN + 1) }))
      .toMatchObject({ presence: 'BUSY', manual: true });
  });

  it('does NOT survive the user disappearing', () => {
    // Otherwise someone who set "Available" on Friday still looks available
    // on Monday morning.
    expect(effectivePresence({
      ...base, manual: true, stored: 'AVAILABLE', lastSeenAt: minsAgo(OFFLINE_AFTER_MIN + 5),
    })).toMatchObject({ presence: 'OFFLINE', manual: false, reason: 'offline' });
  });

  it('an admin lock outranks everything, even absence', () => {
    expect(effectivePresence({
      ...base, locked: true, stored: 'DND', lastSeenAt: null, inMeeting: true,
    })).toMatchObject({ presence: 'DND', manual: true, reason: 'manual' });
  });
});

describe('parsing a choice', () => {
  it('accepts the five statuses in any case', () => {
    expect(parsePresenceChoice('available')).toBe('AVAILABLE');
    expect(parsePresenceChoice('  Busy ')).toBe('BUSY');
    expect(parsePresenceChoice('DND')).toBe('DND');
    expect(parsePresenceChoice('away')).toBe('AWAY');
    expect(parsePresenceChoice('OFFLINE')).toBe('OFFLINE');
  });

  it('accepts AUTO as "stop overriding"', () => {
    expect(parsePresenceChoice('auto')).toBe('AUTO');
  });

  it('rejects anything else rather than defaulting', () => {
    for (const bad of ['', 'ONLINE', 'idle', 'invisible', 'DROP TABLE']) {
      expect(parsePresenceChoice(bad)).toBeNull();
    }
  });
});
