import type { Database } from '@/lib/supabase/database.types';
import { cautivaLabel, type CautivaStage } from '../domain/cautiva';
import { difficultyFor, type DifficultyLevel } from '../domain/difficulty';
import { SECTOR_LABELS } from '../domain/labels';
import { assertPromptSize, clip, dataBlock } from './prompt-input';
import { EVALUATOR_PROMPT } from './prompts/evaluator';
import type { RubricForValidation, TranscriptMessage } from './validate-evaluation';

/**
 * Input of the evaluator as returned by `claim_practice_evaluation` (FR-038): transcript with ids
 * "mN", the full scenario (buyer, objections, goal, product version with verifiable facts) and the
 * versioned rubric. Nothing about the user (no name, no email) nor other sessions.
 */
type Enums = Database['public']['Enums'];

export interface EvaluationClaim {
  session: {
    id: string;
    organizationId: string;
    userId: string;
    difficulty: DifficultyLevel;
    focusStage: CautivaStage | null;
    endReason: Enums['practice_end_reason'] | null;
    attempt: number;
    dueAt: string;
  };
  scenario: {
    buyer: {
      name: string;
      age: number;
      occupation: string;
      intro: string;
      goal: string;
      motivation: string;
      personality: string;
    };
    revealables: Array<{ key: string; value: string }>;
    visibleObjection: string;
    hiddenObjections: Array<{ id: string; text: string }>;
    product: {
      version: number;
      sector: Enums['product_sector'];
      name: string;
      description: string | null;
      priceKind: Enums['price_kind'];
      priceMin: number;
      priceMax: number;
      benefits: string[];
      differentiators: string[] | null;
      verifiableFacts: string[] | null;
    };
  };
  rubric: {
    id: string;
    version: RubricForValidation['version'];
    name: string;
    criteria: Array<{
      key: string;
      name: string;
      weight: number;
      stages: CautivaStage[];
      description: string;
      anchors: { low: string; mid: string; high: string };
    }>;
  };
  transcript: TranscriptMessage[];
}

const END_REASON_LABELS: Record<Enums['practice_end_reason'], string> = {
  goal_achieved: 'el cliente aceptó la meta',
  buyer_abandoned: 'el cliente abandonó la conversación',
  message_limit: 'se alcanzó el límite de mensajes',
  time_limit: 'se acabó el tiempo',
  seller_ended: 'el vendedor terminó la práctica',
};

export function messageId(seq: number): string {
  return `m${seq}`;
}

export function buildEvaluatorPrompt(claim: EvaluationClaim): { system: string; prompt: string } {
  const { scenario, rubric, session } = claim;
  const difficulty = difficultyFor(session.difficulty);
  const rubricBlock = dataBlock('rubrica', {
    version: rubric.version,
    nombre: rubric.name,
    criterios: rubric.criteria.map((c) => ({
      key: c.key,
      nombre: c.name,
      peso: c.weight,
      etapas: c.stages.map(cautivaLabel),
      descripcion: c.description,
      anclas: { bajo: c.anchors.low, medio: c.anchors.mid, alto: c.anchors.high },
    })),
  });
  const scenarioBlock = dataBlock('escenario', {
    comprador: {
      nombre: scenario.buyer.name,
      edad: scenario.buyer.age,
      ocupacion: scenario.buyer.occupation,
      presentacion: clip(scenario.buyer.intro, 280),
      motivacion: clip(scenario.buyer.motivation, 300),
      personalidad: clip(scenario.buyer.personality, 300),
      datos_por_descubrir: scenario.revealables.map((r) => ({ dato: r.key, valor: r.value })),
    },
    meta_del_vendedor: clip(scenario.buyer.goal, 160),
    objecion_visible: clip(scenario.visibleObjection, 300),
    objeciones_ocultas: scenario.hiddenObjections.map((o) => clip(o.text, 300)),
    dificultad: { nivel: difficulty.level, nombre: difficulty.name },
    etapa_foco: session.focusStage ? cautivaLabel(session.focusStage) : null,
    cierre: session.endReason ? END_REASON_LABELS[session.endReason] : null,
    producto: {
      version: scenario.product.version,
      rubro: SECTOR_LABELS[scenario.product.sector],
      nombre: clip(scenario.product.name, 120),
      descripcion: clip(scenario.product.description ?? '', 1000),
      precio: {
        tipo: scenario.product.priceKind === 'fixed' ? 'fijo' : 'rango',
        minimo_soles: scenario.product.priceMin,
        maximo_soles: scenario.product.priceMax,
      },
      beneficios: scenario.product.benefits.map((b) => clip(b, 200)),
      diferenciadores: (scenario.product.differentiators ?? []).map((d) => clip(d, 200)),
      datos_verificables: (scenario.product.verifiableFacts ?? []).map((f) => clip(f, 200)),
    },
  });
  const transcriptBlock = dataBlock(
    'transcripcion',
    claim.transcript.map((m) => ({
      id: messageId(m.seq),
      autor: m.author === 'seller' ? 'vendedor' : 'cliente',
      texto: clip(m.content, m.author === 'seller' ? 1000 : 700),
    })),
  );
  const system = EVALUATOR_PROMPT.text;
  const prompt = `Evalúa esta práctica.\n\n${rubricBlock}\n\n${scenarioBlock}\n\n${transcriptBlock}`;
  assertPromptSize([system, prompt]);
  return { system, prompt };
}
