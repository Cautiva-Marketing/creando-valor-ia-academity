import { randomUUID } from 'node:crypto';
import type { Database } from '../../../src/lib/supabase/database.types';
import { adminClient, type CreatedSeller } from './factories';
import { SEED_PRACTICE } from './seed-data';

/**
 * TEST-ONLY practice factories (T040, tasks.md → "Regla de datos e2e"). They write with the secret
 * key on top of the seller and organization created by factories.ts and never create `ai_usage`
 * rows. Sessions use the fixed persona of the fake AI provider so tests can assert visible fields.
 */
type Enums = Database['public']['Enums'];
type Result = { data: unknown; error: { message: string } | null };

function must<R extends Result>(
  result: R,
  what: string,
): NonNullable<Extract<R, { error: null }>['data']> {
  if (result.error || result.data == null) {
    throw new Error(`practice factory ${what}: ${result.error?.message ?? 'no data'}`);
  }
  return result.data as NonNullable<Extract<R, { error: null }>['data']>;
}

function check(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`practice factory ${what}: ${result.error.message}`);
}

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

/** Fixed persona of the fake provider (src/lib/ai/fake/buyer-setup.ts uses the same). */
export const FAKE_PERSONA = {
  name: 'Rosa Quispe',
  age: 42,
  occupation: 'Contadora independiente',
  intro:
    'Busca un lote para invertir pensando en el futuro de sus hijos; compara opciones en el sur de Lima.',
  goal: 'Agendar una visita al lote',
  motivation: 'Quiere asegurar un patrimonio para sus hijos sin arriesgar sus ahorros.',
  personality: 'Prudente y analítica; desconfía de las promesas sin documentos.',
  revealables: [
    { key: 'budget', value: 'S/ 45 000 – S/ 50 000', budget_min: 45000, budget_max: 50000 },
    { key: 'timeline', value: 'Antes de fin de año' },
    { key: 'decision_maker', value: 'Decide junto con su esposo' },
  ],
  hiddenObjection: 'Desconfía de que la documentación del terreno esté en regla.',
} as const;

// ------------------------------------------------------------------------------------------- products

export interface ProductOptions {
  name?: string;
  sector?: Enums['product_sector'];
  description?: string;
  priceKind?: Enums['price_kind'];
  priceMin?: number;
  priceMax?: number;
  benefits?: string[];
  differentiators?: string[];
  verifiableFacts?: string[];
  archived?: boolean;
}

export interface CreatedProduct {
  id: string;
  versionId: string;
  name: string;
}

export async function createProduct(
  seller: CreatedSeller,
  {
    name = `Lote de prueba ${randomUUID().slice(0, 6)}`,
    sector = 'real_estate',
    description = 'Lotes de 120 m² con habilitación urbana, a 10 minutos de la Panamericana Sur.',
    priceKind = 'range',
    priceMin = 45000,
    priceMax = priceKind === 'fixed' ? priceMin : 60000,
    benefits = ['Saneamiento físico legal completo', 'A 10 minutos de la Panamericana Sur'],
    differentiators = ['Financiamiento directo hasta 24 meses'],
    verifiableFacts = ['Partida registral inscrita en Sunarp'],
    archived = false,
  }: ProductOptions = {},
): Promise<CreatedProduct> {
  const admin = adminClient();
  const product = must(
    await admin
      .from('products')
      .insert({
        organization_id: seller.orgId,
        created_by: seller.id,
        current_name: name,
        status: archived ? 'archived' : 'active',
        archived_at: archived ? new Date().toISOString() : null,
      })
      .select('id')
      .single(),
    'product',
  );
  const version = must(
    await admin
      .from('product_versions')
      .insert({
        organization_id: seller.orgId,
        product_id: product.id,
        version: 1,
        sector,
        name,
        description,
        price_kind: priceKind,
        price_min: priceMin,
        price_max: priceMax,
        benefits,
        differentiators,
        verifiable_facts: verifiableFacts,
        created_by: seller.id,
      })
      .select('id')
      .single(),
    'product_version',
  );
  return { id: product.id, versionId: version.id, name };
}

export async function createObjections(
  seller: CreatedSeller,
  productId: string,
  objections: Array<string | { text: string; category: Enums['objection_category'] | null }> = [
    { text: 'Me queda muy lejos de Lima.', category: 'logistics' },
  ],
): Promise<string[]> {
  const rows = must(
    await adminClient()
      .from('objections')
      .insert(
        objections.map((o) => ({
          organization_id: seller.orgId,
          product_id: productId,
          text: typeof o === 'string' ? o : o.text,
          category: typeof o === 'string' ? null : o.category,
        })),
      )
      .select('id'),
    'objections',
  );
  return rows.map((r) => r.id);
}

export async function setQuota(orgId: string, daily: number, monthly: number): Promise<void> {
  check(
    await adminClient()
      .from('quotas')
      .update({ daily_limit: daily, monthly_limit: monthly })
      .eq('organization_id', orgId),
    'quota',
  );
}

// ------------------------------------------------------------------------------------------- sessions

export interface SessionOptions {
  product?: CreatedProduct;
  objectionIds?: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
  hintsEnabled?: boolean;
  focusStage?: Enums['cautiva_stage'] | null;
}

export interface CreatedSession {
  id: string;
  product: CreatedProduct;
  objectionIds: string[];
}

const INITIAL_INTEREST = { 1: 55, 2: 50, 3: 45, 4: 35, 5: 25 } as const;
const VISIBLE_OBJECTION = 'Me queda muy lejos de Lima.';
const OPENING =
  'Hola. Vi el lote, pero me queda muy lejos de Lima y no sé si vale la pena ir hasta allá.';

async function insertSession(
  seller: CreatedSeller,
  options: SessionOptions,
  state: Partial<Database['public']['Tables']['practice_sessions']['Insert']>,
): Promise<CreatedSession> {
  const admin = adminClient();
  const product = options.product ?? (await createProduct(seller));
  const objectionIds = options.objectionIds ?? (await createObjections(seller, product.id));
  const difficulty = options.difficulty ?? 3;
  const id = randomUUID();
  check(
    await admin.from('practice_sessions').insert({
      id,
      organization_id: seller.orgId,
      user_id: seller.id,
      product_id: product.id,
      product_version_id: product.versionId,
      product_version: 1,
      difficulty,
      hints_enabled: options.hintsEnabled ?? true,
      focus_stage: options.focusStage ?? null,
      selected_objection_ids: objectionIds,
      visible_objection: VISIBLE_OBJECTION,
      visible_objection_category: 'logistics',
      interest: INITIAL_INTEREST[difficulty],
      setup_idempotency_key: randomUUID(),
      configured_expires_at: inSeconds(24 * 3600),
      buyer_setup_prompt_version: 'buyer-setup@1.0.0',
      buyer_prompt_version: 'buyer@1.0.0',
      buyer_setup_model: 'fake-buyer_setup',
      buyer_model: 'fake-buyer',
      ...state,
    }),
    'practice_session',
  );
  const owner = { session_id: id, organization_id: seller.orgId, user_id: seller.id };
  check(
    await admin.from('practice_buyer_profiles').insert({
      ...owner,
      name: FAKE_PERSONA.name,
      age: FAKE_PERSONA.age,
      occupation: FAKE_PERSONA.occupation,
      intro: FAKE_PERSONA.intro,
      goal: FAKE_PERSONA.goal,
      revealable_labels: ['budget', 'timeline', 'decision_maker'],
    }),
    'buyer_profile',
  );
  check(
    await admin.from('practice_session_secrets').insert({
      ...owner,
      motivation: FAKE_PERSONA.motivation,
      personality: FAKE_PERSONA.personality,
      revealables: FAKE_PERSONA.revealables.map((r) => ({ ...r })),
      hidden_objections: [
        { id: 'h1', text: FAKE_PERSONA.hiddenObjection, category: 'trust', source: 'generated' },
      ],
      opening_message: OPENING,
    }),
    'secrets',
  );
  return { id, product, objectionIds };
}

/** A configured session (pre-screen) that has not consumed quota yet. */
export async function createConfiguredSession(
  seller: CreatedSeller,
  options: SessionOptions & { expiresInSeconds?: number } = {},
): Promise<CreatedSession> {
  return insertSession(seller, options, {
    status: 'configured',
    configured_expires_at: inSeconds(options.expiresInSeconds ?? 24 * 3600),
  });
}

/**
 * An active session with `sellerMessages` answered turns (seller + buyer each), the opening message
 * m1 and its consumption. `interest` is the current value; `deadlineInSeconds` the remaining time.
 */
export async function createActiveSession(
  seller: CreatedSeller,
  {
    sellerMessages = 0,
    interest,
    deadlineInSeconds = 20 * 60,
    ...options
  }: SessionOptions & {
    sellerMessages?: number;
    interest?: number;
    deadlineInSeconds?: number;
  } = {},
): Promise<CreatedSession> {
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const current = interest ?? INITIAL_INTEREST[options.difficulty ?? 3];
  const session = await insertSession(seller, options, {
    status: 'active',
    interest: current,
    seller_message_count: sellerMessages,
    last_seq: 1 + 2 * sellerMessages,
    started_at: startedAt,
    deadline_at: inSeconds(deadlineInSeconds),
  });
  const owner = { organization_id: seller.orgId, user_id: seller.id, session_id: session.id };
  const messages: Database['public']['Tables']['practice_messages']['Insert'][] = [
    {
      ...owner,
      seq: 1,
      author: 'buyer',
      content: OPENING,
      interest_after: current,
      meta_status: 'valid',
    },
  ];
  for (let i = 1; i <= sellerMessages; i++) {
    messages.push(
      {
        ...owner,
        seq: 2 * i,
        author: 'seller',
        content: `Mensaje de prueba ${i}: ¿qué es lo más importante para usted?`,
        client_message_id: randomUUID(),
      },
      {
        ...owner,
        seq: 2 * i + 1,
        author: 'buyer',
        content: `Respuesta de prueba ${i}.`,
        reply_to_seq: 2 * i,
        interest_before: current,
        interest_after: current,
        interest_delta: 0,
        seller_abusive: false,
        meta_status: 'valid',
      },
    );
  }
  check(await adminClient().from('practice_messages').insert(messages), 'messages');
  check(
    await adminClient()
      .from('simulation_consumptions')
      .insert({ ...owner, consumed_at: startedAt }),
    'consumption',
  );
  return session;
}

/** Moves the deadline of an active session to the past (time limit, FR-028d). */
export async function forceDeadline(sessionId: string): Promise<void> {
  check(
    await adminClient()
      .from('practice_sessions')
      .update({ deadline_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', sessionId),
    'deadline',
  );
}

/**
 * An evaluated session: two answered turns and an immutable evaluation with the 7 rubric criteria
 * (scores from `scores`, keyed by criterion; missing keys are no_evaluable) and optional flags.
 */
export async function createEvaluatedSession(
  seller: CreatedSeller,
  {
    scores = {
      first_impression: 8,
      diagnosis: 15,
      value_argument: 14,
      objection_handling: 9,
      negotiation_close: 12,
      follow_up: 7,
    },
    flags = [],
    reveals = [{ kind: 'revealable', key: 'budget', seq: 3 }],
    ...options
  }: SessionOptions & {
    scores?: Partial<Record<string, number>>;
    flags?: Array<{ type: Enums['ethical_flag_type']; explanation: string; seqs: number[] }>;
    /** What the seller discovered (buyer message seq where it appeared). */
    reveals?: Array<{ kind: 'revealable' | 'hidden_objection'; key: string; seq: number }>;
  } = {},
): Promise<CreatedSession & { evaluationId: string; total: number | null }> {
  const admin = adminClient();
  const session = await createActiveSession(seller, {
    ...options,
    sellerMessages: 2,
    interest: 60,
  });
  check(
    await admin
      .from('practice_sessions')
      .update({
        status: 'evaluated',
        end_reason: 'seller_ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', session.id),
    'evaluated status',
  );
  const criteria = must(
    await admin
      .from('rubric_criteria')
      .select('id, key, weight')
      .eq('rubric_id', SEED_PRACTICE.rubricId)
      .order('position'),
    'rubric criteria',
  );
  const evaluated = criteria.filter((c) => scores[c.key] !== undefined);
  const sum = evaluated.reduce((acc, c) => acc + Math.min(scores[c.key]!, c.weight), 0);
  const max = evaluated.reduce((acc, c) => acc + c.weight, 0);
  const total = max === 0 ? null : Math.floor((200 * sum + max) / (2 * max));
  const level: Enums['score_level'] | null =
    total === null
      ? null
      : total >= 90
        ? 'advanced'
        : total >= 75
          ? 'competent'
          : total >= 60
            ? 'developing'
            : 'reinforcement';
  const owner = { organization_id: seller.orgId, user_id: seller.id };
  const evaluation = must(
    await admin
      .from('practice_evaluations')
      .insert({
        ...owner,
        session_id: session.id,
        rubric_id: SEED_PRACTICE.rubricId,
        rubric_version: '1.0',
        prompt_version: 'evaluator@1.1.0',
        model: 'fake-evaluator',
        total_score: total,
        level,
        strengths: ['Preguntaste por el objetivo del cliente.'],
        improvements: ['Explora la objeción antes de proponer el siguiente paso.'],
        suggested_drill_text:
          'Practica cómo indagar la causa de una objeción antes de responderla.',
        suggested_drill_stage: 'innova',
        auto_attempts: 1,
        manual_retries: 0,
      })
      .select('id')
      .single(),
    'evaluation',
  );
  check(
    await admin.from('practice_evaluation_criteria').insert(
      criteria.map((c) => {
        const score = scores[c.key];
        return {
          ...owner,
          evaluation_id: evaluation.id,
          criterion_id: c.id,
          status: score === undefined ? ('no_evaluable' as const) : ('evaluated' as const),
          score: score === undefined ? null : Math.min(score, c.weight),
          max_score: c.weight,
          evidence_seqs: score === undefined ? [] : [2],
          justification:
            score === undefined
              ? 'No hay evidencia suficiente para evaluar este criterio.'
              : 'Justificación de prueba basada en el mensaje m2.',
          improvement: score === undefined ? '' : 'Mejora sugerida de prueba.',
          confidence: score === undefined ? 0.4 : 0.8,
        };
      }),
    ),
    'criteria',
  );
  if (flags.length > 0) {
    check(
      await admin.from('practice_ethical_flags').insert(
        flags.map((f) => ({
          ...owner,
          evaluation_id: evaluation.id,
          type: f.type,
          explanation: f.explanation,
          message_seqs: f.seqs,
        })),
      ),
      'flags',
    );
  }
  if (reveals.length > 0) {
    const values = new Map<string, string>([
      ...FAKE_PERSONA.revealables.map((r) => [r.key, r.value] as [string, string]),
      ['h1', FAKE_PERSONA.hiddenObjection],
    ]);
    check(
      await admin.from('practice_session_reveals').insert(
        reveals.map((r) => ({
          ...owner,
          session_id: session.id,
          kind: r.kind,
          item_key: r.key,
          value: values.get(r.key) ?? r.key,
          message_seq: r.seq,
        })),
      ),
      'reveals',
    );
  }
  return { ...session, evaluationId: evaluation.id, total };
}

/** Publishes version 2 of a product (FR-002: past sessions keep the version they used). */
export async function bumpProductVersion(
  seller: CreatedSeller,
  product: CreatedProduct,
  name: string,
): Promise<void> {
  const admin = adminClient();
  const v1 = must(
    await admin.from('product_versions').select('*').eq('id', product.versionId).single(),
    'product_version v1',
  );
  const { id: _id, created_at: _created, ...rest } = v1;
  check(
    await admin
      .from('product_versions')
      .insert({ ...rest, version: 2, name, created_by: seller.id }),
    'product_version v2',
  );
  check(
    await admin
      .from('products')
      .update({ current_version: 2, current_name: name })
      .eq('id', product.id),
    'product v2',
  );
}
