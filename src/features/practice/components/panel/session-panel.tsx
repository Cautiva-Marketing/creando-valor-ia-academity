'use client';

import { PanelBottomOpen } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
  BottomSheetTrigger,
} from '@/components/ui/bottom-sheet';
import { cautivaLabel, type CautivaStage } from '../../domain/cautiva';
import { MOOD_LABELS } from '../../domain/mood';
import { OBJECTION_CATEGORY_LABELS, REVEALABLE_LABELS } from '../../domain/labels';
import type { PublicState } from '../../stream/protocol';
import { LimitsIndicator } from './limits-indicator';
import { RevealsList } from './reveals-list';
import { formatDelta, Thermometer } from './thermometer';

export interface PanelInfo {
  visibleObjection: string;
  visibleObjectionCategory: keyof typeof OBJECTION_CATEGORY_LABELS | null;
  goal: string;
  focusStage: CautivaStage | null;
  revealableLabels: Array<keyof typeof REVEALABLE_LABELS>;
}

function PanelBody({
  info,
  state,
  onNavigate,
}: {
  info: PanelInfo;
  state: PublicState;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Thermometer interest={state.interest} mood={state.mood} lastDelta={state.lastDelta} />
      <LimitsIndicator messagesLeft={state.messagesLeft} deadlineAt={state.deadlineAt} />
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-semibold text-text-muted">Objeción que plantea</dt>
          <dd>
            {info.visibleObjection}
            {info.visibleObjectionCategory ? (
              <Badge className="ml-2">
                {OBJECTION_CATEGORY_LABELS[info.visibleObjectionCategory]}
              </Badge>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm font-semibold text-text-muted">Tu meta</dt>
          <dd>{info.goal}</dd>
        </div>
        {info.focusStage ? (
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-semibold text-text-muted">Etapa foco</dt>
            <dd>{cautivaLabel(info.focusStage)}</dd>
          </div>
        ) : null}
      </dl>
      <RevealsList labels={info.revealableLabels} reveals={state.reveals} onNavigate={onNavigate} />
    </div>
  );
}

/**
 * Session panel (T121; FR-025, FR-026): a side column on desktop; on mobile SessionSummaryBar opens
 * the same content in the 001 bottom sheet, which closes with Escape and returns the focus.
 */
export function SessionPanel({ info, state }: { info: PanelInfo; state: PublicState }) {
  return (
    <aside
      aria-label="Panel de la práctica"
      className="rounded-lg border border-border bg-surface-raised p-5"
      data-testid="session-panel"
    >
      <PanelBody info={info} state={state} />
    </aside>
  );
}

/** Mobile summary (interest and mood always visible) that opens the panel in a bottom sheet. */
export function SessionSummaryBar({ info, state }: { info: PanelInfo; state: PublicState }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised p-3"
      data-testid="session-summary-bar"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Interés {state.interest}</span>
        <span>· {MOOD_LABELS[state.mood]}</span>
        {state.lastDelta ? (
          <span className="text-text-muted">({formatDelta(state.lastDelta)})</span>
        ) : null}
      </p>
      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetTrigger asChild>
          <Button variant="secondary" size="sm">
            <PanelBottomOpen aria-hidden="true" />
            Ver panel
          </Button>
        </BottomSheetTrigger>
        <BottomSheetContent className="overflow-y-auto">
          <BottomSheetTitle className="text-xl">Panel de la práctica</BottomSheetTitle>
          <BottomSheetDescription className="sr-only">
            Interés del cliente, límites, objeción, meta y datos por descubrir.
          </BottomSheetDescription>
          <PanelBody info={info} state={state} onNavigate={() => setOpen(false)} />
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
