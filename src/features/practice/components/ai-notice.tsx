import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * AI usage notice (FR-061) shown on the setup screen, during the session and on the result.
 * The buyer is fictitious and AI-generated; the evaluation is automatic and only a guide.
 */
const COPY = {
  setup: {
    title: 'Práctica con inteligencia artificial',
    body: 'Tu comprador es ficticio y lo genera una IA a partir de tu producto. No ingreses datos personales reales de clientes.',
  },
  session: {
    title: 'Comprador simulado con IA',
    body: 'Las respuestas las genera una IA y pueden equivocarse. No compartas datos personales reales.',
  },
  result: {
    title: 'Evaluación automática y orientativa',
    body: 'La genera una IA con la rúbrica de la plataforma. Úsala como guía para practicar, no como una calificación definitiva.',
  },
} as const;

export type AiNoticeVariant = keyof typeof COPY;

export function AiNotice({
  variant,
  compact = false,
  className,
}: {
  variant: AiNoticeVariant;
  /** Single line (title only) for tight spaces such as the chat header. */
  compact?: boolean;
  className?: string;
}) {
  const { title, body } = COPY[variant];
  return (
    <aside
      aria-label="Aviso de uso de IA"
      className={cn(
        'flex gap-3 rounded-md border border-border bg-surface-sunken p-3 text-sm text-text',
        compact && 'items-center py-2',
        className,
      )}
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden="true" />
      {compact ? (
        <p className="font-medium">{title}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">{title}</p>
          <p className="text-text-muted">{body}</p>
        </div>
      )}
    </aside>
  );
}
