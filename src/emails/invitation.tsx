import { Button, Heading, Link, Section, Text } from 'react-email';
import { formatLongDate } from '@/lib/format';
import { emailStyles } from '@/styles/email';
import { EmailLayout } from './components/email-layout';

export const INVITATION_SUBJECT = 'Te invitamos a Creando Valor IA™';

export interface InvitationEmailProps {
  inviterName: string;
  acceptUrl: string;
  expiresAt: Date;
  expiresInDays: number;
}

/** Invitation email (contracts/emails.md → InvitationEmail). Dates in es-PE, America/Lima. */
export default function InvitationEmail({
  inviterName,
  acceptUrl,
  expiresAt,
  expiresInDays,
}: InvitationEmailProps) {
  const days = `${expiresInDays} ${expiresInDays === 1 ? 'día' : 'días'}`;
  // Single strings: React would split interpolations with <!-- --> markers in the HTML.
  const intro = `${inviterName}, del equipo Cautiva, te invita a Creando Valor IA™.`;
  const expiry = `Este enlace vence el ${formatLongDate(expiresAt, 'America/Lima')} (${days}) y solo puede usarse una vez.`;
  return (
    <EmailLayout
      preview={`${inviterName} te invita a practicar tus ventas con Creando Valor IA™.`}
      reason="Recibes este correo porque el equipo de Cautiva Marketing te invitó a la plataforma."
    >
      <Heading as="h1" className="cv-text" style={emailStyles.heading}>
        Hola:
      </Heading>
      <Text className="cv-text" style={emailStyles.text}>
        {intro}
      </Text>
      <Text className="cv-text" style={emailStyles.text}>
        Es una plataforma para practicar tus conversaciones de venta con compradores simulados por
        IA antes de hacerlas de verdad.
      </Text>
      <Section style={emailStyles.buttonSection}>
        <Button href={acceptUrl} className="cv-button" style={emailStyles.button}>
          Activar mi cuenta
        </Button>
      </Section>
      <Text className="cv-text" style={emailStyles.text}>
        {expiry}
      </Text>
      <Text className="cv-muted" style={emailStyles.small}>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </Text>
      <Text style={emailStyles.small}>
        <Link href={acceptUrl} className="cv-link" style={emailStyles.link}>
          {acceptUrl}
        </Link>
      </Text>
      <Text className="cv-muted" style={emailStyles.small}>
        Creando Valor IA™ usa inteligencia artificial para simular compradores y darte
        retroalimentación; sus respuestas pueden contener errores.
      </Text>
      <Text className="cv-muted" style={emailStyles.small}>
        Si no esperabas esta invitación, ignora este correo.
      </Text>
    </EmailLayout>
  );
}

InvitationEmail.PreviewProps = {
  inviterName: 'Sofía Superadmin',
  acceptUrl: 'http://localhost:3000/invitacion/ejemplo',
  expiresAt: new Date('2026-12-01T03:00:00Z'),
  expiresInDays: 7,
} satisfies InvitationEmailProps;
