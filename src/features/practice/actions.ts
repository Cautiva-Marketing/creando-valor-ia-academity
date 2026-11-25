'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  fail,
  fromPostgresError,
  ok,
  unexpected,
  type ActionFailure,
  type ActionResult,
  type PostgrestLikeError,
} from '@/lib/action-result';
import { getModel } from '@/lib/ai/provider';
import { authenticateAction } from '@/lib/auth/guards';
import { authorizeSeller } from '@/lib/auth/seller';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf } from '@/features/auth/schemas';
import { generateBuyerSetup } from './ai/buyer-setup';
import { BUYER_PROMPT } from './ai/prompts/buyer';
import { promptRef } from './ai/prompts/registry';
import type { BuyerSetupOutput } from './ai/schemas';
import type { DifficultyLevel } from './domain/difficulty';
import { drawObjections } from './domain/draw';
import { quotaExhaustedMessage, setupLimitMessage } from './domain/quota-copy';
import { scheduleEvaluation } from './evaluation/schedule';
import { selectHint, selectIdeas } from './hints/select';
import { hintStateFrom } from './hints/state';
import { getActiveSessionView } from './queries';
import {
  practiceAgainSchema,
  practiceSetupSchema,
  sessionIdSchema,
  type PracticeSetupInput,
} from './schemas';

/**
 * Practice actions (contracts/server-actions.md → "Práctica"): auth → user_mutation → Zod → seller
 * of the personal organization → SQL (authority) → AI (only after every SQL check passed) → SQL.
 * AI output and persona texts are never logged (FR-057).
 */

/** Buyer turn prompt recorded on the session (FR-035). */
const BUYER_PROMPT_VERSION = promptRef(BUYER_PROMPT);

const CONFLICT_MESSAGES: Record<string, string> = {
  product_archived: 'Este producto está archivado. Reactívalo o elige otro.',
  turn_in_progress: 'Espera la respuesta del cliente.',
  no_seller_messages: 'Envía al menos un mensaje antes de terminar.',
  not_active: 'Esta práctica ya terminó.',
  hint_already_used: 'Ya pediste una pista en este turno.',
  not_failed: 'La evaluación ya no está fallida; actualiza la página.',
  retries_exhausted: 'Ya usaste los 3 reintentos de esta evaluación.',
  expired: 'Esta configuración venció. Configura otra práctica.',
  not_configured: 'Esta práctica ya no está disponible.',
};

/** Maps a SQL error with copy that needs the seller's time zone. */
function practiceError(
  error: PostgrestLikeError,
  timezone: string,
  context: string,
): ActionFailure {
  if (error.code === '42501') return fail('suspended');
  const failure = fromPostgresError(error, context);
  switch (failure.code) {
    case 'quota_exhausted':
      return { ...failure, message: quotaExhaustedMessage(failure.details, timezone) };
    case 'setup_limit':
      return { ...failure, message: setupLimitMessage(failure.details, timezone) };
    case 'conflict': {
      const reason = failure.details?.reason;
      return reason && CONFLICT_MESSAGES[reason]
        ? { ...failure, message: CONFLICT_MESSAGES[reason] }
        : failure;
    }
    case 'not_found':
      return {
        ...failure,
        message: 'El producto o las objeciones elegidas ya no están disponibles.',
      };
    default:
      return failure;
  }
}

function setupInput(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  return {
    productId: text('productId'),
    objectionIds: formData.getAll('objectionIds').filter((v): v is string => typeof v === 'string'),
    difficulty: text('difficulty'),
    hintsEnabled: text('hintsEnabled'),
    focusStage: text('focusStage'),
    idempotencyKey: text('idempotencyKey'),
  };
}

function setupPayload(
  input: PracticeSetupInput,
  productVersionId: string,
  visibleObjectionId: string,
  output: BuyerSetupOutput,
  versions: { setupPrompt: string; setupModel: string; buyerModel: string },
): Json {
  return {
    setup_idempotency_key: input.idempotencyKey,
    product_id: input.productId,
    product_version_id: productVersionId,
    objection_ids: input.objectionIds,
    visible_objection_id: visibleObjectionId,
    generated_hidden_objection: output.generated_hidden_objection ?? null,
    difficulty: input.difficulty,
    hints_enabled: input.hintsEnabled,
    focus_stage: input.focusStage,
    buyer: { ...output.buyer, goal: output.goal },
    revealables: output.revealables,
    opening_message: output.opening_message,
    buyer_setup_prompt_version: versions.setupPrompt,
    buyer_prompt_version: BUYER_PROMPT_VERSION,
    buyer_setup_model: versions.setupModel,
    buyer_model: versions.buyerModel,
  } as Json;
}

type ObjectionCategory = Parameters<typeof generateBuyerSetup>[0]['visibleObjection']['category'];

/** The configure flow; returns the session id (new or already created with this key) or a failure. */
async function configure(
  input: PracticeSetupInput,
  orgId: string,
  userId: string,
  timezone: string,
): Promise<{ sessionId: string } | ActionFailure> {
  const supabase = await createClient();

  // Same form submitted twice: go to the session it already created, without calling the AI.
  const { data: existing, error: existingError } = await supabase
    .from('practice_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('setup_idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existingError) return unexpected(existingError, 'configurePractice.idempotency');
  if (existing) return { sessionId: existing.id };

  const { data: check, error: checkError } = await supabase.rpc('check_practice_setup', {
    p_product: input.productId,
    p_objection_ids: input.objectionIds,
  });
  if (checkError) return practiceError(checkError, timezone, 'configurePractice.check');
  const setup = check?.[0];
  if (!setup) {
    return unexpected(new Error('check_practice_setup returned no row'), 'configurePractice');
  }

  const { data: version, error: versionError } = await supabase
    .from('product_versions')
    .select(
      'name, description, price_kind, price_min, price_max, benefits, differentiators, verifiable_facts',
    )
    .eq('id', setup.product_version_id)
    .single();
  if (versionError) return unexpected(versionError, 'configurePractice.version');

  const objections = setup.objections as Array<{
    id: string;
    text: string;
    category: ObjectionCategory;
  }>;
  const byId = new Map(objections.map((o) => [o.id, o]));
  const { visibleId, hiddenIds } = drawObjections(input.objectionIds);
  const visible = byId.get(visibleId);
  if (!visible) return unexpected(new Error('drawn objection missing'), 'configurePractice');

  const persona = await generateBuyerSetup({
    organizationId: orgId,
    userId,
    sector: setup.sector,
    product: {
      name: version.name,
      description: version.description,
      priceKind: version.price_kind,
      priceMin: Number(version.price_min),
      priceMax: Number(version.price_max),
      benefits: version.benefits,
      differentiators: version.differentiators,
      verifiableFacts: version.verifiable_facts,
    },
    visibleObjection: { text: visible.text, category: visible.category },
    hiddenObjections: hiddenIds
      .map((id) => byId.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => ({ text: o.text, category: o.category })),
    difficulty: input.difficulty as DifficultyLevel,
    focusStage: input.focusStage,
  });

  const admin = createAdminClient();
  const recordFailure = async (code: 'provider_unavailable' | 'invalid_persona') => {
    const { error } = await admin.rpc('record_practice_setup_failure', {
      p_user: userId,
      p_failure_code: code,
    });
    return error ? unexpected(error, 'configurePractice.recordFailure') : fail('ai_unavailable');
  };
  if (!persona.ok) return recordFailure(persona.failureCode);

  const { data: created, error: createError } = await admin.rpc('create_configured_practice', {
    p_user: userId,
    p_payload: setupPayload(input, setup.product_version_id, visibleId, persona.output, {
      setupPrompt: persona.promptVersion,
      setupModel: persona.modelId,
      buyerModel: getModel('buyer').modelId,
    }),
  });
  // A persona the database rejects (23514) counts as an invalid one.
  if (createError?.code === '23514') return recordFailure('invalid_persona');
  if (createError) return practiceError(createError, timezone, 'configurePractice.create');
  const row = created?.[0];
  if (!row) {
    return unexpected(new Error('create_configured_practice returned no row'), 'configurePractice');
  }
  return { sessionId: row.session_id };
}

/**
 * Configures a practice (FR-009–FR-016): SQL checks (quota, caps, active session, product,
 * objections) → draw of the visible objection → persona (≤ 3 AI attempts) → configured session.
 * Never consumes quota. Success redirects to the pre-screen.
 */
export async function configurePractice(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = practiceSetupSchema.safeParse(setupInput(formData));
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  let result: { sessionId: string } | ActionFailure;
  try {
    result = await configure(parsed.data, seller.orgId, auth.ctx.user_id, auth.ctx.timezone);
  } catch (error) {
    return unexpected(error, 'configurePractice');
  }
  if ('ok' in result) return result;
  revalidatePath('/practicar');
  redirect(`/practicas/${result.sessionId}`);
}

/**
 * "Practicar de nuevo" (FR-048): same product (current version), objections, difficulty and hints of
 * the source session, with the suggested stage as focus; a new buyer and draw through the flow of
 * configurePractice. An archived product or a deleted objection → /practicar with a notice.
 */
export async function practiceAgain(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = practiceAgainSchema.safeParse({
    sessionId: formData.get('sessionId'),
    idempotencyKey: formData.get('idempotencyKey'),
  });
  if (!parsed.success) return fail('not_found');
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  let result: { sessionId: string } | ActionFailure | { changed: string };
  try {
    const supabase = await createClient();
    const { data: source, error } = await supabase
      .from('practice_sessions')
      .select(
        'product_id, selected_objection_ids, difficulty, hints_enabled, practice_evaluations(suggested_drill_stage)',
      )
      .eq('id', parsed.data.sessionId)
      .eq('user_id', auth.ctx.user_id)
      .maybeSingle();
    if (error) return unexpected(error, 'practiceAgain.source');
    if (!source) return fail('not_found');
    const evaluation = Array.isArray(source.practice_evaluations)
      ? source.practice_evaluations[0]
      : source.practice_evaluations;
    const focus = evaluation?.suggested_drill_stage ?? null;

    const [product, objections] = await Promise.all([
      supabase.from('products').select('status').eq('id', source.product_id).maybeSingle(),
      supabase.from('objections').select('id').in('id', source.selected_objection_ids),
    ]);
    if (product.error) return unexpected(product.error, 'practiceAgain.product');
    if (objections.error) return unexpected(objections.error, 'practiceAgain.objections');
    const changed =
      !product.data ||
      product.data.status !== 'active' ||
      (objections.data ?? []).length !== source.selected_objection_ids.length;
    if (changed) {
      const query = new URLSearchParams({ producto: source.product_id });
      if (focus) query.set('foco', focus);
      query.set('aviso', 'configuracion-cambiada');
      result = { changed: `/practicar?${query.toString()}` };
    } else {
      result = await configure(
        {
          productId: source.product_id,
          objectionIds: source.selected_objection_ids,
          difficulty: source.difficulty,
          hintsEnabled: source.hints_enabled,
          focusStage: focus,
          idempotencyKey: parsed.data.idempotencyKey,
        },
        seller.orgId,
        auth.ctx.user_id,
        auth.ctx.timezone,
      );
    }
  } catch (error) {
    return unexpected(error, 'practiceAgain');
  }
  if ('changed' in result) redirect(result.changed);
  if ('ok' in result) return result;
  revalidatePath('/practicar');
  redirect(`/practicas/${result.sessionId}`);
}

/**
 * Starts a configured practice (FR-018): one atomic SQL call consumes one simulation, inserts m1 and
 * sets the 20 minute deadline. Idempotent: an already active session returns ok without consuming.
 */
export async function startPractice(
  _prev: ActionResult<{ sessionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ sessionId: string }>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = sessionIdSchema.safeParse({ sessionId: formData.get('sessionId') });
  if (!parsed.success) return fail('not_found');
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('start_practice_session', {
      p_session: parsed.data.sessionId,
    });
    if (error) return practiceError(error, auth.ctx.timezone, 'startPractice');
    const row = data?.[0];
    if (!row)
      return unexpected(new Error('start_practice_session returned no row'), 'startPractice');
  } catch (error) {
    return unexpected(error, 'startPractice');
  }
  revalidatePath(`/practicas/${parsed.data.sessionId}`);
  revalidatePath('/practicar');
  revalidatePath('/inicio');
  return ok({ sessionId: parsed.data.sessionId });
}

/**
 * Ends the practice by the seller (FR-028e, FR-029): `finish_practice_session` → finalized + seller_ended +
 * pending; then the evaluation runs after the response. Idempotent by state.
 */
export async function finishPractice(
  _prev: ActionResult<{ sessionId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ sessionId: string }>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = sessionIdSchema.safeParse({ sessionId: formData.get('sessionId') });
  if (!parsed.success) return fail('not_found');
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('finish_practice_session', {
      p_session: parsed.data.sessionId,
    });
    if (error) return practiceError(error, auth.ctx.timezone, 'finishPractice');
    if (data?.[0]?.evaluation_status === 'pending') scheduleEvaluation(parsed.data.sessionId);
  } catch (error) {
    return unexpected(error, 'finishPractice');
  }
  revalidatePath(`/practicas/${parsed.data.sessionId}`);
  revalidatePath('/practicar');
  revalidatePath('/inicio');
  return ok({ sessionId: parsed.data.sessionId });
}

/**
 * One hint per seller turn (FR-031): `request_practice_hint` records the use; the hint and the ideas
 * come from the fixed catalog and the public state (never from the secrets).
 */
export async function requestHint(
  _prev: ActionResult<{ hint: string; ideas: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ hint: string; ideas: string[] }>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = sessionIdSchema.safeParse({ sessionId: formData.get('sessionId') });
  if (!parsed.success) return fail('not_found');
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('request_practice_hint', {
      p_session: parsed.data.sessionId,
    });
    if (error) {
      if (error.code === 'P0010' && error.details === 'hints_disabled') return fail('forbidden');
      return practiceError(error, auth.ctx.timezone, 'requestHint');
    }
    const view = await getActiveSessionView(parsed.data.sessionId);
    const hintState = hintStateFrom({
      state: view.state,
      focusStage: view.session.focusStage,
      revealableLabels: view.session.buyer?.revealableLabels ?? [],
      selectedObjectionCount: view.selectedObjectionCount,
    });
    return ok({
      hint: selectHint(hintState).text,
      ideas: selectIdeas(hintState).map((idea) => idea.text),
    });
  } catch (error) {
    return unexpected(error, 'requestHint');
  }
}

/**
 * Manual retry of a failed evaluation (FR-043): at most 3 per session, without consuming quota; the
 * evaluation goes back to `pending` and is scheduled at once.
 */
export async function retryEvaluation(
  _prev: ActionResult<{ manualRetriesLeft: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ manualRetriesLeft: number }>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = sessionIdSchema.safeParse({ sessionId: formData.get('sessionId') });
  if (!parsed.success) return fail('not_found');
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  let manualRetriesLeft = 0;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('retry_practice_evaluation', {
      p_session: parsed.data.sessionId,
    });
    if (error) return practiceError(error, auth.ctx.timezone, 'retryEvaluation');
    manualRetriesLeft = data?.[0]?.manual_retries_left ?? 0;
    scheduleEvaluation(parsed.data.sessionId);
  } catch (error) {
    return unexpected(error, 'retryEvaluation');
  }
  revalidatePath(`/practicas/${parsed.data.sessionId}`);
  return ok({ manualRetriesLeft });
}
