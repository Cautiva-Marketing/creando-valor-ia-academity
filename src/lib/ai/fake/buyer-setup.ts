import { formatPEN } from '@/lib/format';
import type { FakeResponse, FakeScriptContext } from './index';

/**
 * Fake buyer_setup script (T082) — TESTS ONLY. Always the same fictitious buyer (Rosa Quispe, as in
 * tests/e2e/fixtures/practice-factories.ts → FAKE_PERSONA) with an occupation, intro and goal per
 * sector, and a budget computed from the price so it always passes validatePersona.
 *
 *   [[e2e:setup-falla]] in the product name → every attempt fails with HTTP 503.
 */
interface ProductBlock {
  rubro?: string;
  nombre?: string;
  precio?: { minimo_soles?: number; maximo_soles?: number };
}

interface ScenarioBlock {
  objecion_visible?: { texto?: string };
  generar_objecion_oculta?: boolean;
}

function block<T>(promptText: string, tag: string): T {
  const match = new RegExp(`<${tag}>\\n(.*)\\n</${tag}>`).exec(promptText);
  if (!match) return {} as T;
  try {
    return JSON.parse(match[1]!) as T;
  } catch {
    return {} as T;
  }
}

const BY_SECTOR: Record<string, { occupation: string; intro: string; goal: string }> = {
  Inmobiliaria: {
    occupation: 'Contadora independiente',
    intro:
      'Busca un lote para invertir pensando en el futuro de sus hijos; compara opciones en el sur de Lima.',
    goal: 'Agendar una visita al lote',
  },
  Educación: {
    occupation: 'Asistente administrativa',
    intro: 'Trabaja en una distribuidora y quiere capacitarse para pasar al área comercial.',
    goal: 'Que se inscriba en la clase de prueba',
  },
  Ferretería: {
    occupation: 'Maestra de obra',
    intro: 'Dirige pequeñas remodelaciones en Ate y necesita un proveedor confiable de materiales.',
    goal: 'Que pida una cotización formal',
  },
  Telecom: {
    occupation: 'Dueña de una bodega',
    intro: 'Atiende pedidos por WhatsApp y su conexión actual se cae en las horas de más venta.',
    goal: 'Agendar la instalación del servicio',
  },
};

const DEFAULT_SECTOR = {
  occupation: 'Emprendedora',
  intro: 'Tiene un pequeño negocio familiar en Lima y evalúa nuevas opciones para hacerlo crecer.',
  goal: 'Agendar una reunión de seguimiento',
};

function amount(value: number): string {
  return formatPEN(value).replace(/\.00$/, '');
}

export function buyerSetupScript({ markers, promptText }: FakeScriptContext): FakeResponse {
  if (markers.some((m) => m.name === 'setup-falla')) return { status: 503 };
  const product = block<ProductBlock>(promptText, 'producto');
  const scenario = block<ScenarioBlock>(promptText, 'escenario');
  const priceMin = Number(product.precio?.minimo_soles ?? 0);
  const priceMax = Number(product.precio?.maximo_soles ?? priceMin);
  const budgetMin = Math.ceil(priceMin * 0.8);
  const budgetMax = Math.max(budgetMin, Math.floor(priceMax * 1.1));
  const sector = BY_SECTOR[product.rubro ?? ''] ?? DEFAULT_SECTOR;
  const visible = scenario.objecion_visible?.texto?.trim() || 'Todavía no estoy convencida.';

  const persona = {
    buyer: {
      name: 'Rosa Quispe',
      age: 42,
      occupation: sector.occupation,
      intro: sector.intro,
      motivation: 'Quiere asegurar un patrimonio para sus hijos sin arriesgar sus ahorros.',
      personality: 'Prudente y analítica; desconfía de las promesas sin documentos.',
    },
    revealables: {
      budget: {
        amount_min: budgetMin,
        amount_max: budgetMax,
        display:
          budgetMin === budgetMax
            ? `Unos ${amount(budgetMin)}`
            : `Entre ${amount(budgetMin)} y ${amount(budgetMax)}`,
      },
      timeline: { display: 'Antes de fin de año' },
      decision_maker: { display: 'Decide junto con su esposo' },
    },
    goal: sector.goal,
    ...(scenario.generar_objecion_oculta
      ? {
          generated_hidden_objection: {
            text: 'Desconfía de que la documentación esté en regla.',
            category: 'trust',
          },
        }
      : {}),
    opening_message: `Hola, vi lo que ofreces y me interesa, pero te soy sincera: ${visible}`,
  };
  return { text: JSON.stringify(persona) };
}
