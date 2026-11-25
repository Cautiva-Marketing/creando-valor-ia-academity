'use client';

import { AlertCircle, KeyRound, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UiMessage } from './use-turn-stream';

/**
 * One chat message (T116): `id="m{seq}"` + `tabindex="-1"` so the panel can link to where a datum was
 * revealed; marks "Dato revelado aquí"; a seller message that was not answered shows "No enviado"
 * (or the reason) with "Reintentar" using the same clientMessageId.
 */
export function MessageBubble({
  message,
  buyerName,
  revealedHere = [],
  onRetry,
  retryDisabled = false,
}: {
  message: UiMessage;
  buyerName: string;
  revealedHere?: string[];
  onRetry?: (key: string) => void;
  retryDisabled?: boolean;
}) {
  const seller = message.author === 'seller';
  return (
    <li
      id={message.seq != null ? `m${message.seq}` : undefined}
      tabIndex={message.seq != null ? -1 : undefined}
      data-testid="chat-message"
      data-author={message.author}
      data-status={message.status}
      className={cn('flex flex-col gap-1', seller ? 'items-end' : 'items-start')}
    >
      <span className="sr-only">{seller ? 'Tú:' : `${buyerName}:`}</span>
      <div
        className={cn(
          'max-w-prose rounded-lg px-4 py-2 break-words whitespace-pre-wrap',
          seller
            ? 'rounded-br-sm bg-primary text-on-primary'
            : 'rounded-bl-sm border border-border bg-surface-raised text-text',
          message.status === 'sending' && 'opacity-80',
        )}
      >
        {message.content}
      </div>
      {revealedHere.length > 0 ? (
        <Badge variant="info" data-testid="revealed-here">
          <KeyRound aria-hidden="true" />
          Dato revelado aquí: {revealedHere.join(', ')}
        </Badge>
      ) : null}
      {message.status === 'failed' ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <span className="flex items-center gap-1 text-danger" data-testid="message-failed">
            <AlertCircle className="size-4" aria-hidden="true" />
            {message.error ?? 'No enviado'}
          </span>
          {onRetry ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onRetry(message.key)}
              disabled={retryDisabled}
            >
              <RotateCcw aria-hidden="true" />
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
