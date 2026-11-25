import { MessagesSquare, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CurrentPractice } from '../queries';
import { FinishDialog } from './finish-dialog';

/**
 * Only one practice at a time (FR-015): an active one is resumed ("Retomar") and a configured one is
 * continued on its pre-screen ("Continuar"); an active one can also be ended ("Terminar y evaluar").
 * Reused on Hoy.
 */
export function OngoingPracticeCard({
  practice,
  timezone,
  className,
}: {
  practice: CurrentPractice;
  timezone: string;
  className?: string;
}) {
  const active = practice.status === 'active';
  const who = practice.buyerName ? `con ${practice.buyerName} · ` : '';
  return (
    <Card className={cn('border-accent', className)} data-testid="ongoing-practice">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {active ? (
            <MessagesSquare className="size-5 text-accent-strong" aria-hidden="true" />
          ) : (
            <PlayCircle className="size-5 text-accent-strong" aria-hidden="true" />
          )}
          {active ? 'Tienes una práctica en curso' : 'Tienes una práctica lista para comenzar'}
        </CardTitle>
        <CardDescription>
          {who}
          {practice.productName}
          {active && practice.deadlineAt
            ? ` · termina a más tardar el ${formatDateTime(practice.deadlineAt, timezone)}`
            : null}
          {!active
            ? ` · disponible hasta el ${formatDateTime(practice.configuredExpiresAt, timezone)}`
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Link
          href={`/practicas/${practice.id}`}
          className={cn(buttonVariants({ variant: 'primary' }), 'w-full sm:w-auto')}
        >
          {active ? 'Retomar' : 'Continuar'}
        </Link>
        {active ? (
          <FinishDialog sessionId={practice.id} sellerMessageCount={practice.sellerMessageCount} />
        ) : null}
      </CardContent>
    </Card>
  );
}
