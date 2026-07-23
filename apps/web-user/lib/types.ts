export type UserRole = 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
export type Lang = 'en' | 'id';

export interface Branding {
  tenantId: string;
  tenantName: string;
  displayName: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  loginBgUrl: string | null;
  accessMode: 'SUBDOMAIN' | 'SHARED_URL';
  timezone: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  languagePref: 'EN' | 'ID';
  tenantId: string;
  /** Tenant wall clock, served by /auth/me. */
  timezone?: string;
  /** Feature-flag keys the admin console has switched on for this tenant. */
  features?: string[];
}

export interface BusinessHours { start: string; end: string; days: number[] }

/** Effective booking rules for a resource, resolved TENANT←CATEGORY←ROOM. */
export interface PublicPolicy {
  requiresApproval: boolean;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  businessHours: BusinessHours;
  maxBookingsPerUserPerDay: number;
  allowExternalParticipants: boolean;
  allowRecurring: boolean;
  checkInRequired: boolean;
  /** The room has an admin-set allowlist. */
  restricted: boolean;
  /** Whether *this* user may book it — the allowlist itself is never sent. */
  canBook: boolean;
}

export interface Resource {
  id: string;
  type: 'ROOM' | 'DESK';
  name: string;
  category: string | null;
  capacity: number;
  facilities: string[];
  zone: string | null;
  status: string;
  floor?: { name: string; building?: { name: string } | null } | null;
  policy?: PublicPolicy;
}

/**
 * What the public (unauthenticated) room page receives.
 * Occupied stretches carry no title and no organiser — by design.
 */
export interface PublicRoom {
  room: {
    id: string; name: string; type: 'ROOM' | 'DESK'; capacity: number;
    status: string; facilities: string[];
    floor?: { name: string; building?: { name: string } | null } | null;
  };
  workspace: string;
  timezone: string;
  day: string;
  isToday: boolean;
  busyNow: boolean;
  busyUntil: string | null;
  nextFrom: string | null;
  busy: { id: string; startTime: string; endTime: string }[];
}

/** Every room's day, for the schedule timeline. */
export interface DayGrid {
  day: string;
  timezone: string;
  /** Tenant-local midnight as a real instant — the timeline's origin. */
  dayStart: string;
  dayEnd: string;
  rooms: {
    id: string;
    name: string;
    type: 'ROOM' | 'DESK';
    capacity: number;
    category: string | null;
    floor?: { name: string; building?: { name: string } | null } | null;
    bookings: (RoomBooking & {
      resourceId: string | null;
      principalId?: string;
      bookerId?: string;
    })[];
    restricted?: boolean;
    canBook?: boolean;
  }[];
}

/** Open start times for a room/day/duration — feeds the booking form. */
export interface FreeSlots {
  resourceId: string;
  day: string;
  timezone: string;
  durationMinutes: number;
  /** True when picking any of these slots will land in an approval queue. */
  requiresApproval: boolean;
  maxAdvanceDays: number;
  slots: { startTime: string; endTime: string; label: string }[];
}

/**
 * Contiguous free windows for a room/day — the unified booking form derives
 * both start and end times from these, with a manually chosen duration.
 */
export interface FreeWindows {
  resourceId: string;
  day: string;
  timezone: string;
  /** Server 'now' as an instant, so the client filters the past consistently. */
  now: string;
  /** Local-midnight instant the :00/:30 grid snaps to. */
  gridAnchor: string;
  slotStepMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  requiresApproval: boolean;
  maxAdvanceDays: number;
  allowExternalParticipants: boolean;
  allowRecurring: boolean;
  /** Whole business-hours block (room bookings ignored) — for ONLINE meetings. */
  dayWindow: { start: string; end: string } | null;
  windows: { start: string; end: string }[];
}

/** A colleague's proposal to move a meeting; the author decides. */
export interface ChangeRequest {
  id: string;
  proposedStartTime: string | null;
  proposedEndTime: string | null;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  booking: {
    id: string; title: string; startTime: string; endTime: string;
    status?: string; resource?: { name: string } | null;
  };
  requester?: { fullName: string; email: string };
}

/** One row of a room's day, as shown on the QR landing page. */
export interface RoomBooking {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  principal?: { fullName: string; department: string | null } | null;
}

export interface RoomSchedule {
  resource: Resource;
  timezone: string;
  day: string;
  isToday: boolean;
  busyNow: boolean;
  current: RoomBooking | null;
  next: RoomBooking | null;
  bookings: RoomBooking[];
}

export interface DirectoryUser {
  id: string; fullName: string; email: string; department: string | null;
  presence?: Presence;
  presenceReason?: PresenceView['reason'];
}

export interface Participant {
  userId?: string;
  email: string;
  /** display only — the API stores userId/email */
  name?: string;
  external?: boolean;
}

/**
 * `notified` — in-app notifications actually written.
 * `emailQueued` — messages handed to the mail server. Delivery is asynchronous,
 * so this is not proof of arrival; the admin console has the real status.
 */
export interface InviteResult { notified: number; emailQueued: number }

export interface Booking {
  id: string;
  title: string;
  description?: string | null;
  type: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  resourceId: string | null;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'WAITLIST';
  resource?: { name: string; type: string } | null;
  participants?: Participant[];
  bookerId?: string;
  principalId?: string;
  meetingLink?: string | null;
  checkedInAt?: string | null;
  invites?: InviteResult;
}

/**
 * Schedule assistant. `unknown` is used for guests outside the workspace whose
 * calendar we genuinely cannot see — never conflated with "free".
 */
export interface AvailabilityCheck {
  checked: number;
  people: {
    email: string;
    fullName: string | null;
    status: 'free' | 'busy' | 'unknown';
    busy: { startTime: string; endTime: string }[];
  }[];
}

/** Today's work location. Coordinates are never stored — only this. */
export interface WorkLocation {
  id?: string;
  day?: string;
  location: 'OFFICE' | 'WFH' | 'UNKNOWN';
  officeName?: string | null;
  isManual?: boolean;
}

/** A floor that has a plan image, for the Denah picker. */
export interface FloorOption {
  id: string; name: string; rooms: number;
  building?: { id: string; name: string } | null;
}

export interface FloorPlanView {
  floor: { id: string; name: string; building?: { name: string } | null };
  imageUrl: string | null;
  timezone: string;
  day: string;
  isToday: boolean;
  rooms: {
    id: string; name: string; type: 'ROOM' | 'DESK'; capacity: number;
    category: string | null; facilities: string[]; status: string;
    /** Fraction of the plan image, 0..1. Null when never placed. */
    pin: { resourceId: string; x: number; y: number } | null;
    state: 'available' | 'pending' | 'booked' | 'maintenance';
    current: RoomBooking | null;
    next: RoomBooking | null;
    bookings: RoomBooking[];
    policy?: PublicPolicy;
  }[];
}

export interface ExternalTask {
  id: string; category: string; title: string; body: string | null;
  requesterName: string | null; sourcePlatform: string | null;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  /** Contact-only alternate address; never a login. */
  personalEmail: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  department: string | null;
  languagePref: 'EN' | 'ID';
  createdAt: string;
}

export type Presence = 'AVAILABLE' | 'BUSY' | 'DND' | 'AWAY' | 'OFFLINE';

/** Derived status — see the API's PresenceService for why it is not the column. */
export interface PresenceView {
  presence: Presence;
  /** True when the user pinned it themselves rather than it being derived. */
  manual: boolean;
  reason: 'meeting' | 'idle' | 'offline' | 'manual' | 'active' | null;
  stored?: Presence;
}

export interface ChatPerson {
  id: string; fullName: string; email?: string; department?: string | null;
  presence?: string; lastSeenAt?: string | null;
}

export interface ChatConversation {
  id: string; isGroup: boolean; name: string;
  members: ChatPerson[];
  /** Everyone except the caller — the peer of a 1:1 thread. */
  others?: ChatPerson[];
  lastMessage: { body: string; createdAt: string } | null;
  unread?: number;
  muted?: boolean;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string; body: string; senderId: string | null;
  sender?: { id: string; fullName: string } | null; createdAt: string;
}

export interface AppNotification {
  id: string; type: string; title: string; deepLink: string | null;
  isRead: boolean; createdAt: string;
}

export interface ApprovalStep {
  id: string;
  level: number;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  booking: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    principalId: string;
    resourceId: string | null;
    status: string;
  };
}
