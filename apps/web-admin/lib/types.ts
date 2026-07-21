export type UserRole = 'ADMIN' | 'APPROVER' | 'EMPLOYEE';

/** Envelope returned by the paged admin list endpoints. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
export type Lang = 'en' | 'id';

export interface AuthUser {
  id: string; email: string; fullName: string; role: UserRole;
  languagePref: 'EN' | 'ID'; tenantId: string;
  /** Tenant wall clock, served by /auth/me. */
  timezone?: string;
}

export interface AdminUser {
  id: string; email: string; fullName: string; role: UserRole;
  department: string | null; languagePref: 'EN' | 'ID'; isActive: boolean;
  createdAt: string; tempPassword?: string;
}

export interface AdminResource {
  id: string; type: 'ROOM' | 'DESK'; name: string; category: string | null;
  capacity: number; facilities: string[]; zone: string | null;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  floorId?: string | null; floor?: { name: string } | null;
}

export interface AdminOffice {
  id: string; name: string; address: string | null;
  lat: number | null; lng: number | null;
  geofenceRadiusM: number; isActive: boolean;
  buildings?: { id: string; name: string }[];
}

export interface AdminBuilding {
  id: string; name: string; officeLocationId: string | null;
  floors?: { id: string; name: string }[];
}

export interface AdminFloor {
  id: string; name: string; buildingId: string;
  building?: { id: string; name: string } | null;
  floorPlan?: { imageUrl: string | null } | null;
  _count?: { resources: number };
}

/** Position as a fraction of the plan image (0..1), not pixels. */
export interface FloorPlanPin { resourceId: string; x: number; y: number; }

export interface FloorPlan {
  floorId: string;
  imageUrl: string | null;
  pins: FloorPlanPin[];
  resources: { id: string; name: string; type: 'ROOM' | 'DESK'; status: string }[];
}

/** Mail settings as the console sees them — the password itself never appears. */
export interface MailSettings {
  host: string;
  port: number;
  username: string;
  fromName: string | null;
  fromEmail: string | null;
  enabled: boolean;
  hasPassword: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

export interface MailSettingsResponse {
  settings: MailSettings | null;
  platformFallbackAvailable: boolean;
}

export interface MailStatus {
  configured: boolean;
  ok: boolean;
  detail: string;
  using: string;
}

export interface Policy {
  id: string; scope: 'TENANT' | 'CATEGORY' | 'ROOM';
  category: string | null; resourceId: string | null; rules: Record<string, any>;
}

export interface Branding {
  id?: string; displayName: string | null; primaryColor: string; accentColor: string;
  logoUrl: string | null; loginBgUrl: string | null;
  accessMode: 'SUBDOMAIN' | 'SHARED_URL'; subdomain: string | null;
  timezone: string;
}

export interface AdminBooking {
  id: string; title: string; status: string; startTime: string; endTime: string;
  resource?: { name: string; type: string } | null;
  approvalSteps?: { decision: string; level: number }[];
}

export interface AuditRow {
  id: string; action: string; entity: string | null; entityId: string | null;
  actorId: string | null; createdAt: string;
}

export interface Stats { rooms: number; desks: number; users: number; pendingBookings: number; }

export interface AppNotification {
  id: string; type: string; title: string; deepLink: string | null;
  isRead: boolean; createdAt: string;
}
