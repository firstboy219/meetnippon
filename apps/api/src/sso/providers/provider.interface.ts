export interface SsoIdentity {
  email: string;
  fullName: string;
  providerUserId: string;
}

export interface AuthUrlParams {
  state: string;
  redirectUri: string;
  config: Record<string, any>;
}

export interface ExchangeParams {
  code: string;
  redirectUri: string;
  config: Record<string, any>;
}

/** A pluggable identity provider (Azure AD, Google, or the built-in mock). */
export interface SsoProvider {
  readonly key: string;
  buildAuthUrl(p: AuthUrlParams): string;
  exchangeCode(p: ExchangeParams): Promise<SsoIdentity>;
}
