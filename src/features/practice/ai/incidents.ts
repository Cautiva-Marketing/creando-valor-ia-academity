import 'server-only';
import * as Sentry from '@sentry/nextjs';

/**
 * Buyer turn incidents (FR-034, FR-057): only session id, seller `seq` and the kind — never the
 * message, the reply or any persona text.
 */
export type BuyerIncident = 'meta_fallback' | 'out_of_role' | 'undeclared_reveal';

export interface IncidentRef {
  sessionId: string;
  sellerSeq?: number;
}

export function reportBuyerIncident(kind: BuyerIncident, ref: IncidentRef): void {
  Sentry.captureMessage(`buyer_incident:${kind}`, {
    level: 'warning',
    tags: { context: 'buyer_turn', incident: kind },
    extra: { sessionId: ref.sessionId, sellerSeq: ref.sellerSeq ?? null },
  });
  console.warn(
    `[buyer_incident] kind=${kind} session=${ref.sessionId} seq=${ref.sellerSeq ?? '-'}`,
  );
}
