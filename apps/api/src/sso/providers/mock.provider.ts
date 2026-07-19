import { BadRequestException } from '@nestjs/common';
import { SsoProvider, AuthUrlParams, ExchangeParams, SsoIdentity } from './provider.interface';

/**
 * Built-in mock identity provider — lets SSO be fully exercised end-to-end
 * before real Azure/Google credentials are provisioned. The "authorization
 * code" is simply the user's email (optionally `email|Full Name`); the frontend
 * collects it on a mock consent screen and posts it to the callback.
 */
export class MockProvider implements SsoProvider {
  readonly key = 'mock';

  buildAuthUrl(_p: AuthUrlParams): string {
    // Signals the frontend to render the local mock consent prompt.
    return 'mock:consent';
  }

  async exchangeCode({ code }: ExchangeParams): Promise<SsoIdentity> {
    const [email, name] = code.split('|');
    const trimmed = (email ?? '').trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException('Mock SSO expects an email as the code.');
    }
    const fullName = (name ?? trimmed.split('@')[0]).trim();
    return { email: trimmed, fullName, providerUserId: `mock:${trimmed}` };
  }
}
