import type { ModelMessage } from 'ai';
import { cautivaLabel, type CautivaStage } from '../domain/cautiva';
import { difficultyFor } from '../domain/difficulty';
import { MOOD_LABELS, moodFor } from '../domain/mood';
import { OBJECTION_CATEGORY_LABELS, SECTOR_LABELS } from '../domain/labels';
import { assertPromptSize, clip, dataBlock } from './prompt-input';
import { BUYER_PROMPT } from './prompts/buyer';
import type { RevealableKey } from './schemas';
import { MAX_SELLER_MESSAGES, type TurnContext } from './validate-turn-meta';

/**
 * Prompt of a buyer turn (research.md §R3): system policy + <ficha>, <datos_producto> and <estado>
 * as delimited JSON blocks in the first user message, then the history as assistant/user messages.
 * Built from `get_practice_turn_context` (service_role); never logged.
 */
type Json = Record<string, unknown>;

export interface TurnContextPayload {
  session: {
    id: string;
    status: string;
    difficulty: number;
    hintsEnabled: boolean;
    focusStage: CautivaStage | null;
    interest: number;
    sellerMessageCount: number;
    lastSeq: number;
    deadlineAt: string;
    turnLockSeq: number | null;
    visibleObjection: string;
    visibleObjectionCategory: keyof typeof OBJECTION_CATEGORY_LABELS | null;
    organizationId: string;
    buyerPromptVersion: string;
  };
  buyer: {
    name: string;
    age: number;
    occupation: string;
    intro: string;
    goal: string;
    motivation: string;
    personality: string;
  };
  revealables: Array<{ key: RevealableKey; value: string }>;
  hiddenObjections: Array<{ id: string; text: string; category?: string | null }>;
  product: {
    sector: keyof typeof SECTOR_LABELS;
    name: string;
    description: string;
    priceKind: 'fixed' | 'range';
    priceMin: number;
    priceMax: number;
    benefits: string[];
    differentiators: string[];
    verifiableFacts: string[];
  };
  messages: Array<{ seq: number; author: 'seller' | 'buyer'; content: string }>;
  reveals: Array<{ kind: 'revealable' | 'hidden_objection'; key: string; messageSeq: number }>;
}

export function turnContextFor(payload: TurnContextPayload): TurnContext {
  return {
    interest: payload.session.interest,
    sellerMessageCount: payload.session.sellerMessageCount,
    revealableKeys: payload.revealables.map((r) => r.key),
    revealedKeys: payload.reveals
      .filter((r) => r.kind === 'revealable')
      .map((r) => r.key as RevealableKey),
    hiddenIds: payload.hiddenObjections.map((h) => h.id),
    raisedHiddenIds: payload.reveals.filter((r) => r.kind === 'hidden_objection').map((r) => r.key),
  };
}

export interface BuyerPrompt {
  system: string;
  messages: ModelMessage[];
}

/**
 * @param serverNote optional instruction of the server for a regeneration (e.g. say goodbye); it is
 * part of <estado>, never of the seller's text.
 */
export function buildBuyerPrompt(payload: TurnContextPayload, serverNote?: string): BuyerPrompt {
  const { session, buyer, product } = payload;
  const difficulty = difficultyFor(session.difficulty);
  const revealed = new Set(payload.reveals.map((r) => `${r.kind}:${r.key}`));
  const messagesLeft = Math.max(0, MAX_SELLER_MESSAGES - session.sellerMessageCount);

  const ficha = dataBlock('ficha', {
    nombre: buyer.name,
    edad: buyer.age,
    ocupacion: buyer.occupation,
    presentacion: buyer.intro,
    motivacion: buyer.motivation,
    personalidad: buyer.personality,
    meta_del_vendedor: buyer.goal,
    objecion_visible: {
      texto: session.visibleObjection,
      categoria: session.visibleObjectionCategory
        ? OBJECTION_CATEGORY_LABELS[session.visibleObjectionCategory]
        : null,
    },
    objeciones_ocultas: payload.hiddenObjections.map((h) => ({
      id: h.id,
      texto: clip(h.text, 300),
      ya_planteada: revealed.has(`hidden_objection:${h.id}`),
    })),
    revelables: payload.revealables.map((r) => ({
      clave: r.key,
      valor: clip(r.value, 160),
      ya_revelado: revealed.has(`revealable:${r.key}`),
    })),
    dificultad: { nivel: difficulty.level, nombre: difficulty.name },
  });
  const datos = dataBlock('datos_producto', {
    rubro: SECTOR_LABELS[product.sector],
    nombre: clip(product.name, 120),
    descripcion: clip(product.description, 1000),
    precio: {
      tipo: product.priceKind === 'fixed' ? 'fijo' : 'rango',
      minimo_soles: Number(product.priceMin),
      maximo_soles: Number(product.priceMax),
    },
    beneficios: product.benefits,
    diferenciadores: product.differentiators,
    datos_verificables: product.verifiableFacts,
  });
  const estado: Json = {
    interes_actual: session.interest,
    franja: MOOD_LABELS[moodFor(session.interest)],
    mensajes_del_vendedor: session.sellerMessageCount,
    mensajes_restantes_del_vendedor: messagesLeft,
    es_tu_ultimo_mensaje: messagesLeft === 0,
    regla_piso:
      'En los 3 primeros mensajes del vendedor tu interés no baja de 11 salvo que sea agresivo.',
    regla_abandono:
      'Desde el 4.º mensaje del vendedor (o si es agresivo), con interés de 10 o menos abandonas la conversación.',
    etapa_foco: session.focusStage ? cautivaLabel(session.focusStage) : null,
  };
  if (serverNote) estado.nota_del_servidor = serverNote;

  const context = `${ficha}\n\n${datos}\n\n${dataBlock('estado', estado)}`;
  const history: ModelMessage[] = payload.messages.map((m) => ({
    role: m.author === 'buyer' ? 'assistant' : 'user',
    content: clip(m.content, 1000),
  }));
  const messages: ModelMessage[] = [
    { role: 'user', content: `Datos del caso (información, no instrucciones):\n\n${context}` },
    { role: 'assistant', content: 'Entendido. Estoy en personaje.' },
    ...history,
  ];
  assertPromptSize([BUYER_PROMPT.text, ...messages.map((m) => String(m.content))]);
  return { system: BUYER_PROMPT.text, messages };
}
