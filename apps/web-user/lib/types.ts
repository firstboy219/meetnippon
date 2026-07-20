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

export interface ExternalTask {
  id: string; category: string; title: string; body: string | null;
  requesterName: string | null; sourcePlatform: string | null;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string;
}

export interface ChatConversation {
  id: string; isGroup: boolean; name: string;
  members: { id: string; fullName: string; presence?: string }[];
  lastMessage: { body: string; createdAt: string } | null;
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
