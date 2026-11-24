import { render } from 'react-email';
import { describe, expect, it } from 'vitest';
import InvitationEmail, { INVITATION_SUBJECT } from '@/emails/invitation';

describe('InvitationEmail (contracts/emails.md)', () => {
  it('has the Spanish subject', () => {
    expect(INVITATION_SUBJECT).toBe('Te invitamos a Creando Valor IA™');
  });

  it('renders inviter, es-PE date in America/Lima, days and link in HTML and text', async () => {
    const element = InvitationEmail({
      inviterName: 'Sofía Superadmin',
      acceptUrl: 'http://localhost:3000/invitacion/abcDEF123_-',
      // 2026-12-01 03:00 UTC = 30 Nov 2026 22:00 in Lima
      expiresAt: new Date('2026-12-01T03:00:00Z'),
      expiresInDays: 7,
    });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    for (const output of [html, text]) {
      expect(output).toContain('Sofía Superadmin');
      expect(output).toContain('/invitacion/abcDEF123_-');
      expect(output).toMatch(/30 de noviembre de 2026/);
      expect(output).toContain('(7 días)');
      expect(output).toContain('Activar mi cuenta');
      expect(output).toContain('Si no esperabas esta invitación');
    }
  });

  it('uses the singular for one day', async () => {
    const text = await render(
      InvitationEmail({
        inviterName: 'Sofía',
        acceptUrl: 'http://localhost:3000/invitacion/x',
        expiresAt: new Date('2026-12-01T15:00:00Z'),
        expiresInDays: 1,
      }),
      { plainText: true },
    );
    expect(text).toContain('(1 día)');
  });
});
