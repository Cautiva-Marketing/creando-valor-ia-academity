import { z } from 'zod';
import { parsePENInput } from '@/lib/format';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Product schemas (contracts/server-actions.md → createProduct/updateProduct/setProductStatus;
 * data-model.md → product_versions). Same rules as `private.product_payload` in SQL, which remains
 * the authority (23514 with DETAIL = field).
 */
type Enums = Database['public']['Enums'];

export const PRODUCT_SECTORS = [
  'real_estate',
  'hardware',
  'telecom',
  'cooperative',
  'restaurants',
  'education',
  'b2b_services',
  'other',
] as const satisfies readonly Enums['product_sector'][];

export const PRODUCT_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  descriptionMax: 1000,
  itemMax: 200,
  benefitsMin: 1,
  listMax: 10,
} as const;

const priceField = (label: string) =>
  z
    .string({ error: `Escribe el ${label}.` })
    .trim()
    .min(1, { error: `Escribe el ${label}.` })
    .transform((value, ctx) => {
      const parsed = parsePENInput(value);
      if (parsed === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Escribe un monto válido, por ejemplo 1 250,50 (máximo 2 decimales).',
        });
        return z.NEVER;
      }
      return parsed;
    })
    .pipe(z.number().max(9_999_999_999.99, { error: 'El monto es demasiado alto.' }));

/** Dynamic list: trims, drops blank rows, then checks count and length. */
const textList = (min: number, what: string) =>
  z
    .array(z.string())
    .default([])
    .transform((items) => items.map((item) => item.trim()).filter((item) => item !== ''))
    .pipe(
      z
        .array(
          z.string().max(PRODUCT_LIMITS.itemMax, {
            error: `Cada elemento puede tener hasta ${PRODUCT_LIMITS.itemMax} caracteres.`,
          }),
        )
        .min(min, { error: `Agrega al menos ${min === 1 ? 'un' : min} ${what}.` })
        .max(PRODUCT_LIMITS.listMax, {
          error: `Puedes agregar hasta ${PRODUCT_LIMITS.listMax} elementos.`,
        }),
    );

const productFields = z.object({
  sector: z.enum(PRODUCT_SECTORS, { error: 'Elige el rubro de tu producto.' }),
  name: z
    .string({ error: 'Escribe el nombre del producto.' })
    .trim()
    .min(PRODUCT_LIMITS.nameMin, {
      error: 'Escribe el nombre del producto (al menos 2 caracteres).',
    })
    .max(PRODUCT_LIMITS.nameMax, {
      error: `El nombre puede tener hasta ${PRODUCT_LIMITS.nameMax} caracteres.`,
    }),
  description: z
    .string()
    .trim()
    .max(PRODUCT_LIMITS.descriptionMax, {
      error: `La descripción puede tener hasta ${PRODUCT_LIMITS.descriptionMax.toLocaleString('es-PE')} caracteres.`,
    })
    .optional()
    .transform((value) => value ?? ''),
  priceKind: z.enum(['fixed', 'range'], { error: 'Elige si el precio es fijo o un rango.' }),
  priceMin: priceField('precio'),
  priceMax: z.string().optional(),
  benefits: textList(PRODUCT_LIMITS.benefitsMin, 'beneficio'),
  differentiators: textList(0, 'diferenciador'),
  verifiableFacts: textList(0, 'dato verificable'),
});

type ProductFieldsInput = z.output<typeof productFields>;

/** priceMax: required (and ≥ min) in a range; equal to priceMin when the price is fixed. */
function withPriceMax<T extends ProductFieldsInput>(value: T, ctx: z.RefinementCtx) {
  if (value.priceKind === 'fixed') return { ...value, priceMax: value.priceMin };
  const raw = value.priceMax?.trim() ?? '';
  if (raw === '') {
    ctx.addIssue({
      code: 'custom',
      path: ['priceMax'],
      message: 'Escribe el precio máximo del rango.',
    });
    return z.NEVER;
  }
  const max = parsePENInput(raw);
  if (max === null || max > 9_999_999_999.99) {
    ctx.addIssue({
      code: 'custom',
      path: ['priceMax'],
      message: 'Escribe un monto válido, por ejemplo 1 250,50 (máximo 2 decimales).',
    });
    return z.NEVER;
  }
  if (max < value.priceMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['priceMax'],
      message: 'El precio máximo debe ser mayor o igual al mínimo.',
    });
    return z.NEVER;
  }
  return { ...value, priceMax: max };
}

export const productSchema = productFields
  .extend({ idempotencyKey: z.uuid({ error: 'Recarga la página e inténtalo de nuevo.' }) })
  .transform(withPriceMax);

export const updateProductSchema = productFields
  .extend({
    productId: z.uuid(),
    expectedVersion: z.coerce.number().int().min(1),
  })
  .transform(withPriceMax);

export const productStatusSchema = z.object({
  productId: z.uuid(),
  status: z.enum(['active', 'archived']),
});

export type ProductInput = z.output<typeof productSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;

/** Validated product → jsonb payload of create_product / update_product. */
export function toProductPayload(input: Omit<ProductInput, 'idempotencyKey'> | UpdateProductInput) {
  return {
    sector: input.sector,
    name: input.name,
    description: input.description,
    price_kind: input.priceKind,
    price_min: input.priceMin,
    price_max: input.priceMax,
    benefits: input.benefits,
    differentiators: input.differentiators,
    verifiable_facts: input.verifiableFacts,
  };
}

/** /productos query (contracts/routes.md): invalid values fall back to the defaults. */
export const productListQuerySchema = z.object({
  estado: z.enum(['activos', 'archivados']).catch('activos'),
  q: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value) => {
      const trimmed = value?.trim().slice(0, 80);
      return trimmed ? trimmed : undefined;
    }),
  pagina: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ProductListQuery = z.output<typeof productListQuerySchema>;

/** SQL DETAIL of a 23514 from product_payload → form field. */
export const PRODUCT_FIELD_BY_DETAIL: Record<string, string> = {
  sector: 'sector',
  name: 'name',
  description: 'description',
  price_kind: 'priceKind',
  price_min: 'priceMin',
  price_max: 'priceMax',
  benefits: 'benefits',
  differentiators: 'differentiators',
  verifiable_facts: 'verifiableFacts',
};

// ------------------------------------------------------------------------------------- objections

export const OBJECTION_CATEGORIES = [
  'price',
  'trust',
  'time',
  'competition',
  'logistics',
  'decision_maker',
] as const satisfies readonly Enums['objection_category'][];

export const OBJECTION_LIMITS = { textMin: 5, textMax: 300, perProduct: 20 } as const;

const objectionFields = {
  productId: z.uuid(),
  text: z
    .string({ error: 'Escribe la objeción.' })
    .trim()
    .min(OBJECTION_LIMITS.textMin, { error: 'Escribe la objeción (al menos 5 caracteres).' })
    .max(OBJECTION_LIMITS.textMax, { error: 'La objeción puede tener hasta 300 caracteres.' }),
  /** Empty or absent → no category. */
  category: z
    .union([
      z.enum(OBJECTION_CATEGORIES, { error: 'Elige una categoría de la lista.' }),
      z.literal(''),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
};

/** createObjection (data-model.md → objections.text 5–300 trimmed, objections.category optional). */
export const objectionSchema = z.object(objectionFields);
export const updateObjectionSchema = z.object({ ...objectionFields, objectionId: z.uuid() });
export const deleteObjectionSchema = z.object({ objectionId: z.uuid(), productId: z.uuid() });

export type ObjectionInput = z.output<typeof objectionSchema>;
