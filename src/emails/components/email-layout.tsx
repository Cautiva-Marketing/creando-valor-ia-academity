import type { ReactNode } from 'react';
import { Body, Container, Head, Hr, Html, Preview, Text } from 'react-email';
import { emailDarkCss, emailStyles } from '@/styles/email';

interface EmailLayoutProps {
  preview: string;
  /** Why the person receives this email (footer). */
  reason: string;
  children: ReactNode;
}

/** Common email shell: brand, 600 px, light/dark, automatic-email footer (contracts/emails.md). */
export function EmailLayout({ preview, reason, children }: EmailLayoutProps) {
  return (
    <Html lang="es" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{emailDarkCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="cv-body" style={emailStyles.body}>
        <Container className="cv-container" style={emailStyles.container}>
          <Text className="cv-brand" style={emailStyles.brand}>
            Creando Valor IA™
          </Text>
          {children}
          <Hr style={emailStyles.hr} />
          <Text className="cv-muted" style={emailStyles.footer}>
            Creando Valor IA™ — Cautiva Marketing
          </Text>
          <Text className="cv-muted" style={emailStyles.footer}>
            {reason}
          </Text>
          <Text className="cv-muted" style={emailStyles.footer}>
            Este es un correo automático: no respondas a este mensaje.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
