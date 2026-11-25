import type { TurnContextPayload } from '@/features/practice/ai/buyer-context';
import { runBuyerTurn, type BuyerTurnResult } from '@/features/practice/ai/buyer-turn';
import { normalize } from '@/features/practice/ai/guards';
import { projectTurn } from '@/features/practice/ai/validate-turn-meta';
import type { BuyerScript } from '../buyer-scripts/scripts';

/**
 * Runs a scripted conversation against the real buyer model (T128): builds the turn context like
 * `get_practice_turn_context`, calls `runBuyerTurn` and applies the SQL rules projection between
 * turns. Returns one problem per failed expectation (empty = pass). Usage is not recorded.
 */
export async function runBuyerScript(script: BuyerScript): Promise<string[]> {
  const problems: string[] = [];
  const { opening, ...base } = script.context;
  let interest = base.session.interest;
  const messages: TurnContextPayload['messages'] = [{ seq: 1, author: 'buyer', content: opening }];
  const reveals: TurnContextPayload['reveals'] = [];

  for (const [index, turn] of script.turns.entries()) {
    const sellerSeq = messages.length + 1;
    messages.push({ seq: sellerSeq, author: 'seller', content: turn.seller });
    const context: TurnContextPayload = {
      ...base,
      session: {
        ...base.session,
        interest,
        sellerMessageCount: index + 1,
        lastSeq: sellerSeq,
        turnLockSeq: sellerSeq,
      },
      messages: [...messages],
      reveals: [...reveals],
    };
    const generator = runBuyerTurn(
      {
        organizationId: base.session.organizationId,
        userId: '00000000-0000-4000-a000-00000000g01d',
        sessionId: base.session.id,
        sellerSeq,
        context,
      },
      { recordUsage: async () => {}, reportIncident: () => {} },
    );
    let result: BuyerTurnResult;
    for (;;) {
      const next = await generator.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }

    const where = `${script.id} turn ${index + 1}`;
    if (!result.ok) {
      problems.push(`${where}: no reply (provider failure)`);
      break;
    }
    const reply = normalize(result.reply);
    for (const text of turn.expect.forbidden ?? []) {
      if (reply.includes(normalize(text))) problems.push(`${where}: reply contains "${text}"`);
    }
    for (const key of turn.expect.notRevealed ?? []) {
      if (result.meta.revealed.includes(key)) problems.push(`${where}: revealed ${key}`);
    }
    const delta = result.meta.interest_delta;
    if (turn.expect.interest === 'down' && delta > 0) {
      problems.push(`${where}: interest went up (${delta})`);
    }
    if (turn.expect.interest === 'up' && delta < 0) {
      problems.push(`${where}: interest went down (${delta})`);
    }
    if (result.metaStatus === 'fallback') problems.push(`${where}: metadata fallback`);

    const projection = projectTurn(interest, index + 1, result.meta);
    interest = projection.interestAfter;
    messages.push({ seq: sellerSeq + 1, author: 'buyer', content: result.reply });
    for (const key of result.meta.revealed) {
      reveals.push({ kind: 'revealable', key, messageSeq: sellerSeq + 1 });
    }
    if (result.meta.hidden_objection_raised) {
      reveals.push({
        kind: 'hidden_objection',
        key: result.meta.hidden_objection_raised,
        messageSeq: sellerSeq + 1,
      });
    }
    if (projection.endReason) break;
  }
  return problems;
}
