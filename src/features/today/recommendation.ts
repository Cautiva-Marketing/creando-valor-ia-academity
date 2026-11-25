/**
 * "Hoy" recommended action (T183; FR-052), pure. In order: register a product, add objections (no
 * active product has them), the first practice (no evaluations) or practice the weakest stage (tie →
 * first in C.A.U.T.I.V.A.™ order) with the last used active product as `producto`.
 */
export interface RecommendationStage {
  stage: string;
  label: string;
  average: number | null;
}

export interface RecommendationInput {
  activeProductIds: readonly string[];
  productIdsWithObjections: readonly string[];
  hasEvaluations: boolean;
  /** Products of the latest sessions, newest first (archived ones are skipped). */
  recentProductIds: readonly string[];
  /** The 7 stages in canonical order with their average over the last 5 evaluated sessions. */
  stages: readonly RecommendationStage[];
}

export type NextAction =
  | { kind: 'register_product'; title: string; description: string; cta: string; href: string }
  | { kind: 'add_objections'; title: string; description: string; cta: string; href: string }
  | { kind: 'first_practice'; title: string; description: string; cta: string; href: string }
  | {
      kind: 'practice_stage';
      stage: string;
      title: string;
      description: string;
      cta: string;
      href: string;
    }
  | { kind: 'practice'; title: string; description: string; cta: string; href: string };

export function recommendNextAction(input: RecommendationInput): NextAction & { stage?: string } {
  if (input.activeProductIds.length === 0) {
    return {
      kind: 'register_product',
      title: 'Registra tu primer producto',
      description:
        'Con lo que vendes (precio, beneficios y datos verificables) preparamos a tu cliente simulado.',
      cta: 'Registrar producto',
      href: '/productos/nuevo',
    };
  }
  const withObjections = input.activeProductIds.filter((id) =>
    input.productIdsWithObjections.includes(id),
  );
  if (withObjections.length === 0) {
    return {
      kind: 'add_objections',
      title: 'Agrega objeciones',
      description: 'Anota las objeciones que más escuchas; el cliente simulado las usará contigo.',
      cta: 'Agregar objeciones',
      href: `/productos/${input.activeProductIds[0]}`,
    };
  }
  if (!input.hasEvaluations) {
    return {
      kind: 'first_practice',
      title: 'Haz tu primera práctica',
      description: 'Conversa 20 minutos con un cliente simulado y recibe tu evaluación por etapa.',
      cta: 'Configurar práctica',
      href: '/practicar',
    };
  }

  const product = input.recentProductIds.find((id) => input.activeProductIds.includes(id));
  let weakest: RecommendationStage | null = null;
  for (const s of input.stages) {
    if (s.average !== null && (weakest === null || s.average < weakest.average!)) weakest = s;
  }
  const query = new URLSearchParams();
  if (product) query.set('producto', product);
  if (!weakest) {
    return {
      kind: 'practice',
      title: 'Sigue practicando',
      description: 'Aún no hay criterios evaluados suficientes para sugerirte una etapa.',
      cta: 'Configurar práctica',
      href: query.size ? `/practicar?${query}` : '/practicar',
    };
  }
  query.set('foco', weakest.stage);
  return {
    kind: 'practice_stage',
    stage: weakest.stage,
    title: `Practica ${weakest.label}`,
    description: `Es tu etapa con menor promedio en tus últimas prácticas evaluadas.`,
    cta: `Practicar ${weakest.label}`,
    href: `/practicar?${query}`,
  };
}
