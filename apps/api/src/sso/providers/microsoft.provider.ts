import { BadRequestException } from '@nestjs/common';
import { SsoProvider, AuthUrlParams, ExchangeParams, SsoIdentity } from './provider.interface';
import { decryptSecret } from '../../common/secret-box';

/**
 * Microsoft 365 / Azure AD (OIDC authorization-code). Inert until credentials
 * are supplied: clientId and the (encrypted) client secret both come from the
 * admin console's flag config; `MS_CLIENT_SECRET` in the server env still works
 * as a fallback for deployments configured before the console grew the field.
 * `config.authority` = tenant GUID (restricts sign-in to that directory) or
 * 'common'/'organizations'.
 */
export class MicrosoftProvider implements SsoProvider {
  readonly key = 'microsoft';

  private base(config: Record<string, any>) {
    const authority = config.authority || 'organizations';
    return `https://login.microsoftonline.com/${authority}/oauth2/v2.0`;
  }

  buildAuthUrl({ state, redirectUri, config }: AuthUrlParams): string {
    if (!config.clientId) throw new BadRequestException('Microsoft SSO is not configured.');
    const q = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'openid email profile User.Read',
      state,
    });
    return `${this.base(config)}/authorize?${q.toString()}`;
  }

  async exchangeCode({ code, redirectUri, config }: ExchangeParams): Promise<SsoIdentity> {
    // Console-supplied secret first; env is the legacy fallback. A stored value
    // that will not decrypt (key rotated) must fail loudly rather than silently
    // falling back to a different credential.
    const secret = config.clientSecretEnc
      ? decryptSecret(config.clientSecretEnc as string)
      : process.env.MS_CLIENT_SECRET;
    if (!config.clientId || !secret) throw new BadRequestException('Microsoft SSO is not configured.');
    const tokenRes = await fetch(`${this.base(config)}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: 'openid email profile User.Read',
      }),
    });
    if (!tokenRes.ok) throw new BadRequestException('Microsoft token exchange failed.');
    const token = await tokenRes.json();
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new BadRequestException('Microsoft profile fetch failed.');
    const me = await meRes.json();
    const email = (me.mail || me.userPrincipalName || '').toLowerCase();
    if (!email) throw new BadRequestException('Microsoft profile has no email.');
    return { email, fullName: me.displayName || email, providerUserId: `ms:${me.id}` };
  }
}
