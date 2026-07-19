import { BadRequestException } from '@nestjs/common';
import { SsoProvider, AuthUrlParams, ExchangeParams, SsoIdentity } from './provider.interface';

/**
 * Google OAuth (OIDC authorization-code). Inert until credentials are supplied:
 * clientId via flag config, GOOGLE_CLIENT_SECRET via server env.
 */
export class GoogleProvider implements SsoProvider {
  readonly key = 'google';

  buildAuthUrl({ state, redirectUri, config }: AuthUrlParams): string {
    if (!config.clientId) throw new BadRequestException('Google SSO is not configured.');
    const q = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      access_type: 'offline',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  async exchangeCode({ code, redirectUri, config }: ExchangeParams): Promise<SsoIdentity> {
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!config.clientId || !secret) throw new BadRequestException('Google SSO is not configured.');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new BadRequestException('Google token exchange failed.');
    const token = await tokenRes.json();
    const meRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new BadRequestException('Google profile fetch failed.');
    const me = await meRes.json();
    const email = (me.email || '').toLowerCase();
    if (!email) throw new BadRequestException('Google profile has no email.');
    return { email, fullName: me.name || email, providerUserId: `google:${me.sub}` };
  }
}
