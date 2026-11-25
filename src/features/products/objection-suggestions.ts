import type { Database } from '@/lib/supabase/database.types';
import { OBJECTION_CATEGORY_LABELS } from '@/features/practice/domain/labels';
import { OBJECTION_CATEGORIES } from './schemas';

/**
 * Fixed catalog of objection suggestions by sector and category (FR-007: no AI involved). Texts are
 * generic buyer phrases (5–300 characters, no personal data); the seller edits them before saving.
 */
type Enums = Database['public']['Enums'];
type Sector = Enums['product_sector'];
type Category = Enums['objection_category'];

export { OBJECTION_CATEGORIES };

export const OBJECTION_SUGGESTIONS: Record<Sector, Record<Category, string[]>> = {
  real_estate: {
    price: ['Está caro para la zona.', 'La cuota inicial es muy alta para mí.'],
    trust: [
      'No sé si los papeles del terreno están en regla.',
      'He escuchado de estafas con lotes; me da desconfianza.',
    ],
    time: ['Recién estoy mirando opciones, no tengo apuro.', 'Prefiero esperar a fin de año.'],
    competition: [
      'En otro proyecto me ofrecen un lote más grande al mismo precio.',
      'Otra inmobiliaria me da más meses para pagar.',
    ],
    logistics: ['Me queda muy lejos de Lima.', 'La zona todavía no tiene agua ni luz.'],
    decision_maker: ['Tengo que verlo con mi esposa.', 'Lo tengo que conversar con mi familia.'],
  },
  hardware: {
    price: [
      'En otra ferretería lo encuentro más barato.',
      'Si compro por cantidad, ¿no hay descuento?',
    ],
    trust: ['¿Y si sale fallado? ¿Me lo cambian?', 'No conozco esa marca.'],
    time: ['Todavía no empiezo la obra.', 'Lo necesito para hoy y no sé si llega.'],
    competition: [
      'En el mercado mayorista lo consigo a menos.',
      'Mi maestro de obra compra en otro lado.',
    ],
    logistics: ['¿Hacen delivery hasta mi obra?', 'No tengo cómo llevarme tanto material.'],
    decision_maker: [
      'El maestro de obra es el que decide qué material comprar.',
      'Tengo que consultarlo con mi socio.',
    ],
  },
  telecom: {
    price: [
      'El plan está caro para lo que uso.',
      'Después de la promoción me van a subir la tarifa.',
    ],
    trust: [
      'La señal en mi zona es mala.',
      'He tenido malas experiencias con el servicio técnico.',
    ],
    time: ['Mi contrato actual todavía no vence.', 'Ahora no tengo tiempo para hacer el cambio.'],
    competition: [
      'Otra empresa me da más megas por el mismo precio.',
      'Mi operador actual me hizo una contraoferta.',
    ],
    logistics: [
      '¿Cuánto demora la instalación?',
      'No hay quien esté en casa para recibir al técnico.',
    ],
    decision_maker: [
      'El titular de la línea es mi papá.',
      'En la empresa eso lo decide el área de sistemas.',
    ],
  },
  cooperative: {
    price: ['La tasa de interés es alta.', 'Me cobran muchas comisiones.'],
    trust: [
      'No conozco la cooperativa; prefiero un banco.',
      '¿Mi dinero está protegido si la cooperativa cierra?',
    ],
    time: ['Ahora no tengo dinero para ahorrar.', 'Prefiero esperar a recibir mi gratificación.'],
    competition: [
      'El banco me ofrece una mejor tasa.',
      'En la caja municipal me aprueban más rápido.',
    ],
    logistics: ['No hay una agencia cerca de mi casa.', 'No sé usar la aplicación del celular.'],
    decision_maker: [
      'Tengo que hablarlo con mi pareja.',
      'Mi familia maneja el dinero de la casa.',
    ],
  },
  restaurants: {
    price: ['El menú está caro para el almuerzo diario.', 'Por ese precio como en otro sitio.'],
    trust: ['No sé si la comida es fresca.', 'Leí comentarios malos en internet.'],
    time: ['Solo tengo media hora para almorzar.', 'Los pedidos grandes siempre demoran.'],
    competition: ['El restaurante de al lado tiene promoción.', 'Prefiero pedir por aplicación.'],
    logistics: ['¿Hacen delivery hasta mi oficina?', 'No hay dónde estacionar.'],
    decision_maker: [
      'El evento lo organiza mi jefe; él decide.',
      'Tengo que preguntarle a mis compañeros qué prefieren.',
    ],
  },
  education: {
    price: ['La mensualidad está cara.', 'No puedo pagar la matrícula completa ahora.'],
    trust: ['¿El certificado tiene validez?', 'No conozco a los profesores.'],
    time: [
      'Trabajo todo el día y no tengo horario para estudiar.',
      'Prefiero empezar el próximo ciclo.',
    ],
    competition: ['En otro instituto el curso es más corto.', 'Hay cursos gratis en internet.'],
    logistics: ['La sede me queda lejos.', 'No tengo buena conexión para clases virtuales.'],
    decision_maker: [
      'Mis papás pagan los estudios; ellos deciden.',
      'La empresa tiene que aprobar la capacitación.',
    ],
  },
  b2b_services: {
    price: ['El servicio supera nuestro presupuesto.', 'No vemos el retorno de esa inversión.'],
    trust: ['¿Con qué empresas parecidas han trabajado?', 'No sabemos si cumplirán los plazos.'],
    time: [
      'Ahora no es prioridad; volvamos a conversar el próximo trimestre.',
      'Estamos en cierre de mes, no podemos.',
    ],
    competition: ['Ya trabajamos con otro proveedor.', 'Lo podemos hacer nosotros mismos.'],
    logistics: ['¿Atienden en provincias?', 'Implementarlo nos obliga a cambiar muchos procesos.'],
    decision_maker: ['Lo tiene que aprobar el gerente general.', 'Debo presentarlo al directorio.'],
  },
  other: {
    price: ['Está caro.', 'No tengo presupuesto para eso ahora.'],
    trust: ['No conozco su empresa.', '¿Qué garantía me dan?'],
    time: ['Lo voy a pensar.', 'Ahora no es el momento.'],
    competition: ['Ya tengo otro proveedor.', 'Me ofrecieron algo parecido más barato.'],
    logistics: ['¿Cómo me lo hacen llegar?', 'Me queda lejos.'],
    decision_maker: ['Tengo que consultarlo.', 'No soy yo quien decide.'],
  },
};

export interface SuggestionGroup {
  category: Category;
  label: string;
  items: string[];
}

/** Suggestions for a sector, grouped in the fixed category order. */
export function suggestionsFor(sector: Sector): SuggestionGroup[] {
  const bySector = OBJECTION_SUGGESTIONS[sector];
  return OBJECTION_CATEGORIES.map((category) => ({
    category,
    label: OBJECTION_CATEGORY_LABELS[category],
    items: bySector[category],
  }));
}
