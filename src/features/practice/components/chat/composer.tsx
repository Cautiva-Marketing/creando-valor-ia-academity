'use client';

import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const MAX_MESSAGE_CHARS = 1000;

/** "1.000" as in the copy (es-PE groups with a comma). */
const COUNT_FORMAT = new Intl.NumberFormat('es', { useGrouping: 'always' });

/**
 * Message composer (T117): 1–1.000 characters with a counter, Enter sends and Shift+Enter adds a
 * line, disabled while the buyer answers. The value is controlled by the session view (draft in
 * localStorage and chips that insert text without sending).
 */
export const COMPOSER_ID = 'composer';

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  disabledReason,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  const trimmed = value.trim();
  const canSend = !disabled && trimmed.length > 0 && value.length <= MAX_MESSAGE_CHARS;
  const submit = () => {
    if (canSend) onSend(trimmed);
  };
  const left = MAX_MESSAGE_CHARS - value.length;

  return (
    <form
      aria-label="Enviar mensaje"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={COMPOSER_ID} className="sr-only">
        Tu mensaje
      </label>
      <Textarea
        id={COMPOSER_ID}
        name="text"
        value={value}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder="Escribe tu mensaje…"
        aria-describedby="composer-help composer-count"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="min-h-20"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <span id="composer-help">
          {disabled && disabledReason
            ? disabledReason
            : 'Enter envía · Shift + Enter agrega una línea'}
        </span>
        <span
          id="composer-count"
          aria-live={left <= 50 ? 'polite' : 'off'}
          className={cn(left <= 50 && 'font-semibold text-text')}
          data-testid="composer-count"
        >
          {COUNT_FORMAT.format(value.length)}/1.000
        </span>
      </div>
      <Button type="submit" disabled={!canSend} className="self-end">
        <SendHorizontal aria-hidden="true" />
        Enviar
      </Button>
    </form>
  );
}
