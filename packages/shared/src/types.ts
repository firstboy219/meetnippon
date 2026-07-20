// Shared cross-app types. Kept framework-agnostic (no NestJS/Next imports).

export type UserRole = 'ADMIN' | 'APPROVER' | 'EMPLOYEE';
export type Language = 'EN' | 'ID';
export type AccessMode = 'SUBDOMAIN' | 'SHARED_URL';

/** JWT access-token payload shared by API (sign) and web (decode). */
export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  role: UserRole;
  lang: Language;
}

/** Public tenant branding returned for the login screen (resolved by host). */
export interface PublicBranding {
  tenantId: string;
  tenantName: string;
  /** IANA zone; the wall clock all times are shown and entered in. */
  timezone: string;
  displayName: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  loginBgUrl: string | null;
  accessMode: AccessMode;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  languagePref: Language;
  tenantId: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
}
