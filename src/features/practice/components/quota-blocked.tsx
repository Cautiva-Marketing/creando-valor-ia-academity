import { FormAlert } from '@/components/ui/form-alert';
import { quotaExhaustedMessage, setupLimitMessage } from '../domain/quota-copy';
import type { QuotaStatus } from '../queries';

/**
 * Why practicing is blocked right now (FR-016, FR-017), with the renewal date and time in the
 * seller's time zone. Renders nothing when practicing is allowed.
 */
export function blockedReason(quota: QuotaStatus, timezone: string): string | null {
  if (quota.exhaustedScope) {
    return quotaExhaustedMessage(
      quota.exhaustedScope === 'disabled'
        ? { scope: 'disabled' }
        : { scope: quota.exhaustedScope, renewsAt: quota.renewsAt ?? '' },
      timezone,
    );
  }
  if (quota.setupLimitReason && quota.setupRetryAt) {
    return setupLimitMessage(
      { reason: quota.setupLimitReason, retryAt: quota.setupRetryAt },
      timezone,
    );
  }
  return null;
}

export function QuotaBlocked({ quota, timezone }: { quota: QuotaStatus; timezone: string }) {
  const reason = blockedReason(quota, timezone);
  if (!reason) return null;
  return (
    <FormAlert tone="info" title="Por ahora no puedes practicar" data-testid="quota-blocked">
      {reason}
    </FormAlert>
  );
}
