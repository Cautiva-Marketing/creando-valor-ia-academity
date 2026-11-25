'use client';

import { Clock, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const WARN_MESSAGES = 3;
const WARN_MINUTES = 3;

function minutesLeft(deadlineAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 60_000));
}

/**
 * Messages and time left (T120; FR-028): warnings at 3 messages and 3 minutes. The deadline moves
 * when provider waits are discounted, so it always comes from the latest public state.
 */
export function LimitsIndicator({
  messagesLeft,
  deadlineAt,
  className,
}: {
  messagesLeft: number;
  deadlineAt: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = minutesLeft(deadlineAt, now);

  const fewMessages = messagesLeft <= WARN_MESSAGES;
  const littleTime = minutes <= WARN_MINUTES;

  return (
    <div className={cn('flex flex-col gap-2 text-sm', className)} data-testid="limits">
      <p
        className={cn('flex items-center gap-2', fewMessages && 'font-semibold')}
        data-testid="messages-left"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {fewMessages
          ? `Te quedan ${messagesLeft} ${messagesLeft === 1 ? 'mensaje' : 'mensajes'}`
          : `${messagesLeft} mensajes disponibles`}
      </p>
      <p
        className={cn('flex items-center gap-2', littleTime && 'font-semibold')}
        data-testid="time-left"
      >
        <Clock className="size-4" aria-hidden="true" />
        {littleTime
          ? `Quedan ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
          : `${minutes} minutos restantes`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fewMessages ? `Te quedan ${messagesLeft} mensajes.` : ''}
        {littleTime ? ` Quedan ${minutes} minutos.` : ''}
      </p>
    </div>
  );
}
