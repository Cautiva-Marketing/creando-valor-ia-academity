import { Button, Heading, Link, Section, Text } from 'react-email';
import { EmailLayout } from './components/email-layout';
import { emailStyles } from '@/styles/email';

export const PASSWORD_RECOVERY_SUBJECT = 'Restablece tu contraseña de Creando Valor IA™';

export interface PasswordRecoveryEmailProps {
  resetUrl: string;
}

/** Password recovery email (contracts/emails.md → PasswordRecoveryEmail). */
export default function PasswordRecoveryEmail({ resetUrl }: PasswordRecoveryEmailProps) {
  return (
    <EmailLayout
      preview="Define una nueva contraseña para tu cuenta. El enlace vence en 60 minutos."
      reason="Recibes este correo porque alguien pidió restablecer la contraseña de tu cuenta."
    >
      <Heading as="h1" className="cv-text" style={emailStyles.heading}>
        Restablece tu contraseña
      </Heading>
      <Text className="cv-text" style={emailStyles.text}>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta de Creando Valor IA™.
      </Text>
      <Section style={emailStyles.buttonSection}>
        <Button href={resetUrl} className="cv-button" style={emailStyles.button}>
          Definir nueva contraseña
        </Button>
      </Section>
      <Text className="cv-text" style={emailStyles.text}>
        El enlace vence en 60 minutos y solo puede usarse una vez.
      </Text>
      <Text className="cv-muted" style={emailStyles.small}>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </Text>
      <Text style={emailStyles.small}>
        <Link href={resetUrl} className="cv-link" style={emailStyles.link}>
          {resetUrl}
        </Link>
      </Text>
      <Text className="cv-muted" style={emailStyles.small}>
        Si no fuiste tú, ignora este correo: tu contraseña no cambiará.
      </Text>
    </EmailLayout>
  );
}

PasswordRecoveryEmail.PreviewProps = {
  resetUrl:
    'http://localhost:3000/auth/confirm?token_hash=pkce_ejemplo&type=recovery&next=/restablecer-contrasena',
} satisfies PasswordRecoveryEmailProps;
