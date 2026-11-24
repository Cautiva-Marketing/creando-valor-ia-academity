import { render } from 'react-email';
import { describe, expect, it } from 'vitest';
import PasswordRecoveryEmail, { PASSWORD_RECOVERY_SUBJECT } from '@/emails/password-recovery';

const resetUrl =
  'http://localhost:3000/auth/confirm?token_hash=pkce_abc123&type=recovery&next=/restablecer-contrasena';

describe('PasswordRecoveryEmail (contracts/emails.md)', () => {
  it('has the Spanish subject', () => {
    expect(PASSWORD_RECOVERY_SUBJECT).toBe('Restablece tu contraseña de Creando Valor IA™');
  });

  it('renders HTML and plain text with the link and the 60-minute notice', async () => {
    const element = PasswordRecoveryEmail({ resetUrl });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    for (const output of [html, text]) {
      expect(output).toContain('/auth/confirm?token_hash=pkce_abc123');
      expect(output).toContain('type=recovery');
      expect(output).toContain('60 minutos');
      expect(output).toContain('Definir nueva contraseña');
      expect(output).toContain('Cautiva Marketing');
    }
    expect(html).toContain('lang="es"');
    expect(html).toContain('color-scheme');
  });
});
