import { describe, expect, it } from 'vitest';
import {
  productListQuerySchema,
  productSchema,
  productStatusSchema,
  toProductPayload,
  updateProductSchema,
} from '@/features/products/schemas';

const KEY = '7b0c9d3e-1f2a-4b5c-8d6e-9f0a1b2c3d4e';
const PRODUCT = '3f1e2d4c-5b6a-4978-8a1b-2c3d4e5f6a7b';

const valid = {
  sector: 'real_estate',
  name: '  Lote Las Palmeras ',
  description: 'Lotes de 120 m².',
  priceKind: 'range',
  priceMin: '45 000',
  priceMax: '60 000,50',
  benefits: ['Saneamiento completo', '  Cerca de la playa  '],
  differentiators: [],
  verifiableFacts: ['Partida en Sunarp'],
  idempotencyKey: KEY,
};

function errorsOf(input: unknown) {
  const result = productSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? {} : (result.error.flatten().fieldErrors as Record<string, string[]>);
}

describe('productSchema', () => {
  it('accepts a valid range product, trimming text and parsing es-PE prices', () => {
    const result = productSchema.parse(valid);
    expect(result).toMatchObject({
      name: 'Lote Las Palmeras',
      priceMin: 45000,
      priceMax: 60000.5,
      benefits: ['Saneamiento completo', 'Cerca de la playa'],
    });
  });

  it('accepts "1 250,50" as 1250.5 and fixes priceMax = priceMin for a fixed price', () => {
    const result = productSchema.parse({
      ...valid,
      priceKind: 'fixed',
      priceMin: '1 250,50',
      priceMax: undefined,
    });
    expect(result.priceMin).toBe(1250.5);
    expect(result.priceMax).toBe(1250.5);
  });

  it('rejects an empty or blank name', () => {
    expect(errorsOf({ ...valid, name: '' }).name).toBeDefined();
    expect(errorsOf({ ...valid, name: '    ' }).name).toBeDefined();
    expect(errorsOf({ ...valid, name: 'x'.repeat(121) }).name).toBeDefined();
  });

  it('rejects a negative or malformed price', () => {
    expect(errorsOf({ ...valid, priceMin: '-10' }).priceMin).toBeDefined();
    expect(errorsOf({ ...valid, priceMin: '1 250,555' }).priceMin).toBeDefined();
    expect(errorsOf({ ...valid, priceMin: '' }).priceMin).toBeDefined();
  });

  it('requires priceMax in a range and rejects min > max', () => {
    expect(errorsOf({ ...valid, priceMax: undefined }).priceMax).toBeDefined();
    expect(errorsOf({ ...valid, priceMin: '70 000', priceMax: '60 000' }).priceMax).toBeDefined();
  });

  it('requires 1 to 10 benefits of at most 200 characters (blank rows are dropped)', () => {
    expect(errorsOf({ ...valid, benefits: [] }).benefits).toBeDefined();
    expect(errorsOf({ ...valid, benefits: ['   '] }).benefits).toBeDefined();
    expect(
      errorsOf({ ...valid, benefits: Array.from({ length: 11 }, (_, i) => `B${i}`) }).benefits,
    ).toBeDefined();
    expect(
      errorsOf({ ...valid, differentiators: ['x'.repeat(201)] }).differentiators,
    ).toBeDefined();
    expect(productSchema.parse({ ...valid, benefits: ['Uno', '', '  '] }).benefits).toEqual([
      'Uno',
    ]);
  });

  it('limits the description to 1000 characters', () => {
    expect(errorsOf({ ...valid, description: 'x'.repeat(1001) }).description).toBeDefined();
    expect(productSchema.parse({ ...valid, description: undefined }).description).toBe('');
  });

  it('rejects an unknown sector and a missing idempotency key', () => {
    expect(errorsOf({ ...valid, sector: 'spaceships' }).sector).toBeDefined();
    expect(errorsOf({ ...valid, idempotencyKey: 'nope' }).idempotencyKey).toBeDefined();
  });

  it('maps to the snake_case payload of create_product', () => {
    expect(toProductPayload(productSchema.parse(valid))).toEqual({
      sector: 'real_estate',
      name: 'Lote Las Palmeras',
      description: 'Lotes de 120 m².',
      price_kind: 'range',
      price_min: 45000,
      price_max: 60000.5,
      benefits: ['Saneamiento completo', 'Cerca de la playa'],
      differentiators: [],
      verifiable_facts: ['Partida en Sunarp'],
    });
  });
});

describe('updateProductSchema / productStatusSchema', () => {
  it('needs productId and expectedVersion ≥ 1 instead of an idempotency key', () => {
    const { idempotencyKey: _key, ...rest } = valid;
    expect(
      updateProductSchema.parse({ ...rest, productId: PRODUCT, expectedVersion: '2' })
        .expectedVersion,
    ).toBe(2);
    expect(
      updateProductSchema.safeParse({ ...rest, productId: PRODUCT, expectedVersion: '0' }).success,
    ).toBe(false);
    expect(
      updateProductSchema.safeParse({ ...rest, productId: 'x', expectedVersion: '1' }).success,
    ).toBe(false);
  });

  it('accepts only active/archived', () => {
    expect(productStatusSchema.safeParse({ productId: PRODUCT, status: 'archived' }).success).toBe(
      true,
    );
    expect(productStatusSchema.safeParse({ productId: PRODUCT, status: 'deleted' }).success).toBe(
      false,
    );
  });
});

describe('productListQuerySchema', () => {
  it('defaults to active, page 1, no query', () => {
    expect(productListQuerySchema.parse({})).toEqual({
      estado: 'activos',
      q: undefined,
      pagina: 1,
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(productListQuerySchema.parse({ estado: 'borrados', pagina: '-3', q: '   ' })).toEqual({
      estado: 'activos',
      q: undefined,
      pagina: 1,
    });
    expect(
      productListQuerySchema.parse({ estado: 'archivados', pagina: '3', q: ' lote ' }),
    ).toEqual({
      estado: 'archivados',
      q: 'lote',
      pagina: 3,
    });
  });

  it('caps the search text at 80 characters', () => {
    expect(productListQuerySchema.parse({ q: 'x'.repeat(100) }).q).toHaveLength(80);
  });
});

describe('objection schemas', () => {
  it('trims the text and accepts an optional category', async () => {
    const { objectionSchema } = await import('@/features/products/schemas');
    expect(
      objectionSchema.parse({ productId: PRODUCT, text: '  Está caro.  ', category: 'price' }),
    ).toEqual({
      productId: PRODUCT,
      text: 'Está caro.',
      category: 'price',
    });
    expect(
      objectionSchema.parse({ productId: PRODUCT, text: 'Lo voy a pensar' }).category,
    ).toBeNull();
    expect(
      objectionSchema.parse({ productId: PRODUCT, text: 'Lo voy a pensar', category: '' }).category,
    ).toBeNull();
  });

  it('requires 5–300 characters after trimming and a known category', async () => {
    const { objectionSchema } = await import('@/features/products/schemas');
    expect(objectionSchema.safeParse({ productId: PRODUCT, text: ' Caro ' }).success).toBe(false);
    expect(objectionSchema.safeParse({ productId: PRODUCT, text: 'x'.repeat(301) }).success).toBe(
      false,
    );
    expect(
      objectionSchema.safeParse({ productId: PRODUCT, text: 'Muy caro', category: 'mood' }).success,
    ).toBe(false);
  });

  it('edit and delete need the objection id', async () => {
    const { updateObjectionSchema, deleteObjectionSchema } =
      await import('@/features/products/schemas');
    expect(
      updateObjectionSchema.safeParse({
        objectionId: PRODUCT,
        productId: PRODUCT,
        text: 'Muy caro',
      }).success,
    ).toBe(true);
    expect(updateObjectionSchema.safeParse({ productId: PRODUCT, text: 'Muy caro' }).success).toBe(
      false,
    );
    expect(
      deleteObjectionSchema.safeParse({ objectionId: PRODUCT, productId: PRODUCT }).success,
    ).toBe(true);
    expect(deleteObjectionSchema.safeParse({ objectionId: 'x', productId: PRODUCT }).success).toBe(
      false,
    );
  });
});
