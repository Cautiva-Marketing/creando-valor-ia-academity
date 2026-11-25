import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/seller';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { MAX_SELLER_MESSAGES } from './ai/validate-turn-meta';
import { toPublicState, type PublicState } from './stream/protocol';
import type { ResultSource } from './result/view-model';

/**
 * Reads of /practicar and /practicas/[id] (contracts/routes.md). RLS limits every table to the
 * seller's own rows; the secrets table is never read here (FR-014).
 */
type Enums = Database['public']['Enums'];

export interface QuotaStatus {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  remainingToday: number;
  remainingMonth: number;
  exhaustedScope: 'daily' | 'monthly' | 'disabled' | null;
  renewsAt: string | null;
  setupSuccessToday: number;
  setupFailureToday: number;
  /** Set when 30 successful or 30 failed setups were reached today (FR-016). */
  setupRetryAt: string | null;
  setupLimitReason: 'success' | 'failure' | null;
}

export const SETUP_DAILY_CAP = 30;

export async function getQuotaStatus(): Promise<QuotaStatus> {
  await requireSeller('/practicar');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('practice_quota_status');
  if (error) throw new Error(`quota status failed (${error.code})`);
  const row = data?.[0];
  if (!row) throw new Error('quota status returned no row');
  const scope = row.exhausted_scope;
  return {
    dailyUsed: row.daily_used,
    dailyLimit: row.daily_limit,
    monthlyUsed: row.monthly_used,
    monthlyLimit: row.monthly_limit,
    remainingToday: row.remaining_today,
    remainingMonth: row.remaining_month,
    exhaustedScope: scope === 'daily' || scope === 'monthly' || scope === 'disabled' ? scope : null,
    renewsAt: row.renews_at,
    setupSuccessToday: row.setup_success_today,
    setupFailureToday: row.setup_failure_today,
    setupRetryAt: row.setup_retry_at,
    setupLimitReason:
      row.setup_success_today >= SETUP_DAILY_CAP
        ? 'success'
        : row.setup_failure_today >= SETUP_DAILY_CAP
          ? 'failure'
          : null,
  };
}

export interface SetupObjection {
  id: string;
  text: string;
  category: Enums['objection_category'] | null;
}

export interface SetupProduct {
  id: string;
  name: string;
  sector: Enums['product_sector'];
  objections: SetupObjection[];
}

/** Active products of the seller with their objections (oldest first), newest product first. */
export async function getSetupOptions(): Promise<SetupProduct[]> {
  const { orgId } = await requireSeller('/practicar');
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, current_name, current_version')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .order('id');
  if (error) throw new Error(`setup products failed (${error.code})`);
  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const [versions, objections] = await Promise.all([
    supabase.from('product_versions').select('product_id, version, sector').in('product_id', ids),
    supabase
      .from('objections')
      .select('id, product_id, text, category, created_at')
      .in('product_id', ids)
      .order('created_at')
      .order('id'),
  ]);
  if (versions.error) throw new Error(`setup versions failed (${versions.error.code})`);
  if (objections.error) throw new Error(`setup objections failed (${objections.error.code})`);

  return (products ?? []).map((p) => ({
    id: p.id,
    name: p.current_name,
    sector:
      versions.data.find((v) => v.product_id === p.id && v.version === p.current_version)?.sector ??
      'other',
    objections: objections.data
      .filter((o) => o.product_id === p.id)
      .map((o) => ({ id: o.id, text: o.text, category: o.category })),
  }));
}

export interface CurrentPractice {
  id: string;
  status: 'active' | 'configured';
  productName: string;
  buyerName: string | null;
  deadlineAt: string | null;
  configuredExpiresAt: string;
  sellerMessageCount: number;
}

/** The seller's active practice, or the configured one that has not expired (FR-015). */
export async function getCurrentPractice(): Promise<CurrentPractice | null> {
  const { ctx } = await requireSeller('/practicar');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('id, status, product_id, deadline_at, configured_expires_at, seller_message_count')
    .eq('user_id', ctx.user_id)
    .or(
      `status.eq.active,and(status.eq.configured,configured_expires_at.gt.${new Date().toISOString()})`,
    )
    // At most one of each exists (FR-015); configuring while active is refused by SQL.
    .order('configured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`current practice failed (${error.code})`);
  if (!data) return null;

  const [product, profile] = await Promise.all([
    supabase.from('products').select('current_name').eq('id', data.product_id).maybeSingle(),
    supabase.from('practice_buyer_profiles').select('name').eq('session_id', data.id).maybeSingle(),
  ]);
  return {
    id: data.id,
    status: data.status === 'active' ? 'active' : 'configured',
    productName: product.data?.current_name ?? 'Producto',
    buyerName: profile.data?.name ?? null,
    deadlineAt: data.deadline_at,
    configuredExpiresAt: data.configured_expires_at,
    sellerMessageCount: data.seller_message_count,
  };
}

export interface SessionView {
  id: string;
  status: Enums['practice_status'];
  difficulty: number;
  hintsEnabled: boolean;
  focusStage: Enums['cautiva_stage'] | null;
  visibleObjection: string;
  visibleObjectionCategory: Enums['objection_category'] | null;
  interest: number;
  configuredExpiresAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  endReason: Enums['practice_end_reason'] | null;
  evaluationStatus: Enums['evaluation_status'] | null;
  evaluationPhase: Enums['evaluation_phase'] | null;
  manualRetriesLeft: number;
  productId: string;
  productName: string;
  productVersion: number;
  /** configured and past its 24 h validity (maintenance may not have discarded it yet). */
  expired: boolean;
  buyer: {
    name: string;
    age: number;
    occupation: string;
    intro: string;
    goal: string;
    revealableLabels: Enums['revealable_key'][];
  } | null;
  timezone: string;
}

/** Session + public buyer profile of the seller. Foreign or unknown ids → notFound(). */
async function loadSessionView(id: string): Promise<SessionView> {
  const { ctx } = await requireSeller(`/practicas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from('practice_sessions')
    .select(
      'id, status, difficulty, hints_enabled, focus_stage, visible_objection, visible_objection_category, interest, configured_expires_at, started_at, deadline_at, end_reason, evaluation_status, evaluation_phase, evaluation_manual_retries, product_id, product_version_id, product_version',
    )
    .eq('id', id)
    .eq('user_id', ctx.user_id)
    .maybeSingle();
  if (error) throw new Error(`session read failed (${error.code})`);
  if (!s) notFound();

  const [version, profile] = await Promise.all([
    supabase.from('product_versions').select('name').eq('id', s.product_version_id).maybeSingle(),
    supabase
      .from('practice_buyer_profiles')
      .select('name, age, occupation, intro, goal, revealable_labels')
      .eq('session_id', s.id)
      .maybeSingle(),
  ]);
  if (version.error) throw new Error(`session product failed (${version.error.code})`);
  if (profile.error) throw new Error(`session profile failed (${profile.error.code})`);

  return {
    id: s.id,
    status: s.status,
    difficulty: s.difficulty,
    hintsEnabled: s.hints_enabled,
    focusStage: s.focus_stage,
    visibleObjection: s.visible_objection,
    visibleObjectionCategory: s.visible_objection_category,
    interest: s.interest,
    configuredExpiresAt: s.configured_expires_at,
    startedAt: s.started_at,
    deadlineAt: s.deadline_at,
    endReason: s.end_reason,
    evaluationStatus: s.evaluation_status,
    evaluationPhase: s.evaluation_phase,
    manualRetriesLeft: Math.max(0, 3 - s.evaluation_manual_retries),
    productId: s.product_id,
    productName: version.data?.name ?? 'Producto',
    productVersion: s.product_version,
    expired: s.status === 'configured' && new Date(s.configured_expires_at).getTime() <= Date.now(),
    buyer: profile.data
      ? {
          name: profile.data.name,
          age: profile.data.age,
          occupation: profile.data.occupation,
          intro: profile.data.intro,
          goal: profile.data.goal,
          revealableLabels: profile.data.revealable_labels,
        }
      : null,
    timezone: ctx.timezone,
  };
}

/** Deduplicated per request: the page and getActiveSessionView share one read. */
export const getSessionView = cache(loadSessionView);

export interface ChatMessage {
  seq: number;
  author: 'seller' | 'buyer';
  content: string;
  createdAt: string;
}

export interface ActiveSessionView {
  session: SessionView;
  messages: ChatMessage[];
  state: PublicState;
  hintsUsed: number;
  selectedObjectionCount: number;
  /**
   * Last seller message without a reply (the provider failed or another tab is waiting for it):
   * the browser offers "Reintentar" with the same clientMessageId (SC-009).
   */
  unanswered: { seq: number; content: string; clientMessageId: string | null } | null;
}

/** Active session: transcript, public panel state and the pending turn (FR-020–FR-031). */
export async function getActiveSessionView(id: string): Promise<ActiveSessionView> {
  const session = await getSessionView(id);
  const supabase = await createClient();
  const [s, messages, reveals] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select(
        'interest, last_interest_delta, seller_message_count, deadline_at, turn_lock_seq, turn_lock_expires_at, hints_enabled, hints_used, last_hint_at_seller_count, selected_objection_ids, status',
      )
      .eq('id', session.id)
      .single(),
    supabase
      .from('practice_messages')
      .select('seq, author, content, created_at, reply_to_seq, client_message_id')
      .eq('session_id', session.id)
      .order('seq'),
    supabase
      .from('practice_session_reveals')
      .select('kind, item_key, value, message_seq')
      .eq('session_id', session.id)
      .order('message_seq'),
  ]);
  if (s.error) throw new Error(`active session read failed (${s.error.code})`);
  if (messages.error) throw new Error(`messages read failed (${messages.error.code})`);
  if (reveals.error) throw new Error(`reveals read failed (${reveals.error.code})`);

  const row = s.data;
  const turnInProgress =
    row.turn_lock_seq != null &&
    row.turn_lock_expires_at != null &&
    new Date(row.turn_lock_expires_at).getTime() > Date.now();
  const state = toPublicState({
    interest: row.interest,
    lastDelta: row.last_interest_delta,
    sellerMessageCount: row.seller_message_count,
    messagesLeft: Math.max(0, MAX_SELLER_MESSAGES - row.seller_message_count),
    deadlineAt: row.deadline_at,
    reveals: reveals.data.map((r) => ({
      kind: r.kind,
      key: r.item_key,
      value: r.value,
      messageSeq: r.message_seq,
    })),
    turnInProgress,
    hintAvailable:
      row.status === 'active' &&
      row.hints_enabled &&
      row.last_hint_at_seller_count !== row.seller_message_count,
  });

  const answered = new Set(
    messages.data
      .filter((m) => m.author === 'buyer' && m.reply_to_seq != null)
      .map((m) => m.reply_to_seq),
  );
  const last = messages.data.at(-1);
  const unanswered =
    last && last.author === 'seller' && !answered.has(last.seq)
      ? { seq: last.seq, content: last.content, clientMessageId: last.client_message_id }
      : null;

  return {
    session,
    messages: messages.data.map((m) => ({
      seq: m.seq,
      author: m.author,
      content: m.content,
      createdAt: m.created_at,
    })),
    state,
    hintsUsed: row.hints_used,
    selectedObjectionCount: row.selected_objection_ids.length,
    unanswered,
  };
}

export interface FinishedSessionView {
  session: SessionView;
  messages: ChatMessage[];
}

/** Finished session waiting for (or without) its evaluation: the transcript. */
export async function getFinishedSessionView(id: string): Promise<FinishedSessionView> {
  const session = await getSessionView(id);
  const supabase = await createClient();
  const messages = await supabase
    .from('practice_messages')
    .select('seq, author, content, created_at')
    .eq('session_id', session.id)
    .order('seq');
  if (messages.error) throw new Error(`transcript read failed (${messages.error.code})`);
  return {
    session,
    messages: (messages.data ?? []).map((m) => ({
      seq: m.seq,
      author: m.author,
      content: m.content,
      createdAt: m.created_at,
    })),
  };
}

export interface ResultView {
  session: SessionView;
  messages: ChatMessage[];
  evaluation: {
    totalScore: number | null;
    level: Enums['score_level'] | null;
    createdAt: string;
    strengths: string[];
    improvements: string[];
    suggestedDrillText: string;
    suggestedDrillStage: Enums['cautiva_stage'] | null;
  };
  endedAt: string | null;
  hintsUsed: number;
  source: Omit<ResultSource, 'messages'>;
}

const revealableSchema = z.array(z.object({ key: z.string(), value: z.string() }));
const hiddenObjectionSchema = z.array(z.object({ id: z.string(), text: z.string() }));

/**
 * Evaluated session (T160; FR-046): evaluation, criteria with their rubric texts, ethical flags, the
 * buyer secrets (readable by the owner once the session ended, RLS), reveals and the transcript.
 */
export async function getResultView(id: string): Promise<ResultView> {
  const session = await getSessionView(id);
  if (session.status !== 'evaluated') notFound();
  const supabase = await createClient();
  const [row, messages, evaluation, secrets, reveals] = await Promise.all([
    supabase.from('practice_sessions').select('ended_at, hints_used').eq('id', id).single(),
    supabase
      .from('practice_messages')
      .select('seq, author, content, created_at')
      .eq('session_id', id)
      .order('seq'),
    supabase
      .from('practice_evaluations')
      .select(
        'id, total_score, level, created_at, strengths, improvements, suggested_drill_text, suggested_drill_stage, practice_evaluation_criteria(status, score, max_score, evidence_seqs, justification, improvement, confidence, rubric_criteria(key, name, stages, position)), practice_ethical_flags(type, explanation, message_seqs)',
      )
      .eq('session_id', id)
      .single(),
    supabase
      .from('practice_session_secrets')
      .select('motivation, personality, revealables, hidden_objections')
      .eq('session_id', id)
      .maybeSingle(),
    supabase
      .from('practice_session_reveals')
      .select('kind, item_key, message_seq')
      .eq('session_id', id),
  ]);
  for (const [name, result] of Object.entries({ row, messages, evaluation, secrets, reveals })) {
    if (result.error) throw new Error(`result ${name} read failed (${result.error.code})`);
  }
  const e = evaluation.data!;
  const s = secrets.data;
  return {
    session,
    messages: (messages.data ?? []).map((m) => ({
      seq: m.seq,
      author: m.author,
      content: m.content,
      createdAt: m.created_at,
    })),
    evaluation: {
      totalScore: e.total_score,
      level: e.level,
      createdAt: e.created_at,
      strengths: e.strengths,
      improvements: e.improvements,
      suggestedDrillText: e.suggested_drill_text,
      suggestedDrillStage: e.suggested_drill_stage,
    },
    endedAt: row.data!.ended_at,
    hintsUsed: row.data!.hints_used,
    source: {
      criteria: e.practice_evaluation_criteria.flatMap((c) =>
        c.rubric_criteria
          ? [
              {
                key: c.rubric_criteria.key,
                name: c.rubric_criteria.name,
                position: c.rubric_criteria.position,
                stages: c.rubric_criteria.stages,
                status: c.status,
                score: c.score,
                maxScore: c.max_score,
                evidenceSeqs: c.evidence_seqs,
                justification: c.justification,
                improvement: c.improvement,
                confidence: Number(c.confidence),
              },
            ]
          : [],
      ),
      flags: e.practice_ethical_flags.map((f) => ({
        type: f.type,
        explanation: f.explanation,
        messageSeqs: f.message_seqs,
      })),
      secrets: s
        ? {
            motivation: s.motivation,
            personality: s.personality,
            revealables: revealableSchema.catch([]).parse(s.revealables),
            hiddenObjections: hiddenObjectionSchema.catch([]).parse(s.hidden_objections),
          }
        : null,
      reveals: (reveals.data ?? []).map((r) => ({
        kind: r.kind,
        key: r.item_key,
        messageSeq: r.message_seq,
      })),
    },
  };
}
