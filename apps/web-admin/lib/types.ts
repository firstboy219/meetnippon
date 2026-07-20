export type UserRole = 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
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
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'; floor?: { name: string } | null;
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
