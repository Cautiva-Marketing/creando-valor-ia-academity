import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import type { NextAction } from '../recommendation';

/**
 * Recommended next action (T185; FR-052). Practice actions are replaced by the reason and renewal
 * date when the quota (or the setup limit) blocks practicing.
 */
export function NextActionCard({
  action,
  blockedReason,
}: {
  action: NextAction;
  blockedReason: string | null;
}) {
  const practicing = action.kind !== 'register_product' && action.kind !== 'add_objections';
  const blocked = practicing && blockedReason !== null;
  return (
    <Card data-testid="next-action" data-kind={action.kind}>
      <CardHeader>
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-strong">
          <Sparkles className="size-4" aria-hidden="true" />
          Tu siguiente paso
        </p>
        <CardTitle>{action.title}</CardTitle>
        <CardDescription>{action.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {blocked ? (
          <FormAlert tone="info" title="Por ahora no puedes practicar" data-testid="quota-blocked">
            {blockedReason}
          </FormAlert>
        ) : (
          <Link href={action.href} className={buttonVariants({ variant: 'primary' })}>
            {action.cta}
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
