import type { ResultView as ResultData } from '../../queries';
import { buildResultViewModel } from '../../result/view-model';
import { BuyerRevealed } from './buyer-revealed';
import { CriteriaList } from './criteria-list';
import { EthicalFlags } from './ethical-flags';
import { ScoreHeader } from './score-header';
import { StrengthsImprovements } from './strengths-improvements';
import { SuggestedDrill } from './suggested-drill';
import { Transcript } from './transcript';

/**
 * Full result of an evaluated practice (T169; FR-046–FR-048): score header, breakdown with quotes,
 * strengths and improvements, ethical flags, suggested drill with "Practicar de nuevo", the revealed
 * buyer and the transcript.
 */
export function ResultView({ data }: { data: ResultData }) {
  const { session, evaluation } = data;
  const vm = buildResultViewModel({ ...data.source, messages: data.messages });
  const buyer = session.buyer!;
  return (
    <div className="flex flex-col gap-6" data-testid="evaluation-summary">
      <ScoreHeader
        total={vm.hasScore ? evaluation.totalScore : null}
        level={vm.hasScore ? evaluation.level : null}
        endReason={session.endReason}
        date={data.endedAt ?? evaluation.createdAt}
        timezone={session.timezone}
        productName={session.productName}
        productVersion={session.productVersion}
        difficulty={session.difficulty}
        hintsEnabled={session.hintsEnabled}
        hintsUsed={data.hintsUsed}
      />
      <CriteriaList criteria={vm.criteria} />
      <StrengthsImprovements
        strengths={evaluation.strengths}
        improvements={evaluation.improvements}
      />
      <EthicalFlags flags={vm.flags} />
      <SuggestedDrill
        sessionId={session.id}
        text={evaluation.suggestedDrillText}
        stage={evaluation.suggestedDrillStage}
      />
      <BuyerRevealed buyer={buyer} visibleObjection={session.visibleObjection} vm={vm} />
      <Transcript messages={data.messages} buyerName={buyer.name} />
    </div>
  );
}
