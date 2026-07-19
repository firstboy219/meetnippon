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
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  languagePref: 'EN' | 'ID';
  tenantId: string;
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
}

export interface Booking {
  id: string;
  title: string;
  type: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  resourceId: string | null;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'WAITLIST';
  resource?: { name: string; type: string } | null;
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
