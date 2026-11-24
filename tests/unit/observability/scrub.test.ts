import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubString } from '@/lib/observability/scrub';

describe('Sentry scrubbing (research.md §R21)', () => {
  it('removes emails, invitation tokens and token_hash from strings', () => {
    const out = scrubString(
      'fallo para ana@ejemplo.pe en /invitacion/abcDEF123_-xyz y /auth/confirm?token_hash=secreto&type=recovery',
    );
    expect(out).not.toContain('ana@ejemplo.pe');
    expect(out).not.toContain('abcDEF123_-xyz');
    expect(out).not.toContain('secreto');
    expect(out).toContain('/invitacion/[token]');
    expect(out).toContain('token_hash=[filtered]');
  });

  it('drops bodies, cookies and sensitive headers from events', () => {
    const event = scrubEvent({
      message: 'Error de ana@ejemplo.pe',
      request: {
        url: 'https://app.test/invitacion/tok123?x=1',
        data: { password: 'secreta', email: 'ana@ejemplo.pe' },
        cookies: { 'sb-access-token': 'jwt' },
        headers: { cookie: 'a=b', authorization: 'Bearer x', 'user-agent': 'UA' },
        query_string: 'token_hash=abc&type=recovery',
      },
      user: { id: 'u1', email: 'ana@ejemplo.pe', ip_address: '1.2.3.4' },
      extra: { nested: { email: 'x@y.z', note: 'contact b@c.de' } },
    });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({ 'user-agent': 'UA' });
    expect(event.request?.url).toBe('https://app.test/invitacion/[token]?x=1');
    expect(event.request?.query_string).toBe('token_hash=[filtered]&type=recovery');
    expect(event.user).toEqual({ id: 'u1' });
    expect(JSON.stringify(event)).not.toMatch(/@ejemplo\.pe|b@c\.de|x@y\.z/);
  });

  it('drops input breadcrumbs and scrubs navigation ones', () => {
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'typed' })).toBeNull();
    expect(
      scrubBreadcrumb({ category: 'navigation', data: { to: '/invitacion/secret-token' } })?.data,
    ).toEqual({ to: '/invitacion/[token]' });
  });
});
