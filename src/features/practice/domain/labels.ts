import type { Database } from '@/lib/supabase/database.types';

/** UI labels of the practice enums (data-model.md → "Etiquetas de UI"). Only in TS, never in SQL. */
type Enums = Database['public']['Enums'];

export const SECTOR_LABELS: Record<Enums['product_sector'], string> = {
  real_estate: 'Inmobiliaria',
  hardware: 'Ferretería',
  telecom: 'Telecom',
  cooperative: 'Cooperativa',
  restaurants: 'Restaurantes',
  education: 'Educación',
  b2b_services: 'Servicios B2B',
  other: 'Otro',
};

export const OBJECTION_CATEGORY_LABELS: Record<Enums['objection_category'], string> = {
  price: 'Precio',
  trust: 'Confianza',
  time: 'Tiempo',
  competition: 'Competencia',
  logistics: 'Distancia/logística',
  decision_maker: 'Decisor',
};

export const LEVEL_LABELS: Record<Enums['score_level'], string> = {
  reinforcement: 'Refuerzo',
  developing: 'En desarrollo',
  competent: 'Competente',
  advanced: 'Avanzado',
};

export const END_REASON_LABELS: Record<Enums['practice_end_reason'], string> = {
  goal_achieved: 'Cierre logrado',
  buyer_abandoned: 'Abandono del cliente',
  message_limit: 'Límite de mensajes',
  time_limit: 'Límite de tiempo',
  seller_ended: 'Terminada por el vendedor',
};

export const REVEALABLE_LABELS: Record<Enums['revealable_key'], string> = {
  budget: 'Presupuesto',
  timeline: 'Plazo',
  decision_maker: 'Quién decide',
};

export const ETHICAL_FLAG_LABELS: Record<Enums['ethical_flag_type'], string> = {
  unfounded_promise: 'Promesa sin sustento',
  undue_pressure: 'Presión indebida',
};
