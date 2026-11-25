import { describe, expect, it } from 'vitest';
import { CAUTIVA_STAGES, cautivaLabel, isCautivaStage } from '@/features/practice/domain/cautiva';
import { DIFFICULTIES, difficultyFor } from '@/features/practice/domain/difficulty';
import {
  END_REASON_LABELS,
  LEVEL_LABELS,
  OBJECTION_CATEGORY_LABELS,
  REVEALABLE_LABELS,
  SECTOR_LABELS,
} from '@/features/practice/domain/labels';
import { PRACTICE_LIMITS } from '@/features/practice/domain/limits';
import { MOOD_LABELS, moodFor } from '@/features/practice/domain/mood';

/** T032 — pure practice domain (FR-010, FR-026, FR-028, data-model.md → Etiquetas de UI). */

describe('Cautiva stages', () => {
  it('keeps the canonical order with Spanish labels', () => {
    expect(CAUTIVA_STAGES).toEqual([
      'conoce',
      'aumenta',
      'une',
      'transforma',
      'innova',
      'vende',
      'asegura',
    ]);
    expect(CAUTIVA_STAGES.map(cautivaLabel)).toEqual([
      'Conoce',
      'Aumenta',
      'Une',
      'Transforma',
      'Innova',
      'Vende',
      'Asegura',
    ]);
  });

  it('validates stage values from query strings', () => {
    expect(isCautivaStage('innova')).toBe(true);
    expect(isCautivaStage('INNOVA')).toBe(false);
    expect(isCautivaStage(null)).toBe(false);
  });
});

describe('labels', () => {
  it('names every sector, category, level, end reason and revealable', () => {
    expect(SECTOR_LABELS).toEqual({
      real_estate: 'Inmobiliaria',
      hardware: 'Ferretería',
      telecom: 'Telecom',
      cooperative: 'Cooperativa',
      restaurants: 'Restaurantes',
      education: 'Educación',
      b2b_services: 'Servicios B2B',
      other: 'Otro',
    });
    expect(OBJECTION_CATEGORY_LABELS).toEqual({
      price: 'Precio',
      trust: 'Confianza',
      time: 'Tiempo',
      competition: 'Competencia',
      logistics: 'Distancia/logística',
      decision_maker: 'Decisor',
    });
    expect(LEVEL_LABELS).toEqual({
      reinforcement: 'Refuerzo',
      developing: 'En desarrollo',
      competent: 'Competente',
      advanced: 'Avanzado',
    });
    expect(END_REASON_LABELS).toEqual({
      goal_achieved: 'Cierre logrado',
      buyer_abandoned: 'Abandono del cliente',
      message_limit: 'Límite de mensajes',
      time_limit: 'Límite de tiempo',
      seller_ended: 'Terminada por el vendedor',
    });
    expect(REVEALABLE_LABELS).toEqual({
      budget: 'Presupuesto',
      timeline: 'Plazo',
      decision_maker: 'Quién decide',
    });
  });
});

describe('difficulty (FR-010)', () => {
  it('has five levels with name and initial interest', () => {
    expect(DIFFICULTIES.map((d) => [d.level, d.name, d.initialInterest])).toEqual([
      [1, 'Receptivo', 55],
      [2, 'Abierto', 50],
      [3, 'Cauteloso', 45],
      [4, 'Exigente', 35],
      [5, 'Muy exigente', 25],
    ]);
    for (const d of DIFFICULTIES) expect(d.description.length).toBeGreaterThan(20);
  });

  it('looks a level up', () => {
    expect(difficultyFor(4).name).toBe('Exigente');
  });
});

describe('mood (FR-026, mirror of private.mood)', () => {
  it.each([
    [0, 'distrustful'],
    [29, 'distrustful'],
    [30, 'doubtful'],
    [54, 'doubtful'],
    [55, 'interested'],
    [79, 'interested'],
    [80, 'ready'],
    [100, 'ready'],
  ])('%s → %s', (interest, mood) => {
    expect(moodFor(interest)).toBe(mood);
  });

  it('labels moods in Spanish', () => {
    expect(MOOD_LABELS).toEqual({
      distrustful: 'Desconfiado',
      doubtful: 'Dudando',
      interested: 'Interesado',
      ready: 'Listo para avanzar',
    });
  });
});

describe('session limits (FR-023, FR-027, FR-028)', () => {
  it('matches the spec', () => {
    expect(PRACTICE_LIMITS).toEqual({
      maxSellerMessages: 20,
      sessionMinutes: 20,
      maxMessageChars: 1000,
      warnMessagesLeft: 3,
      warnMinutesLeft: 3,
      maxInterestDelta: 15,
    });
  });
});
