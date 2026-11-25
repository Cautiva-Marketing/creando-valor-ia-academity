'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  fail,
  fromPostgresError,
  ok,
  unexpected,
  type ActionFailure,
  type ActionResult,
  type PostgrestLikeError,
} from '@/lib/action-result';
import { authenticateAction } from '@/lib/auth/guards';
import { authorizeSeller } from '@/lib/auth/seller';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import { fieldErrorsOf, formValues } from '@/features/auth/schemas';
import {
  deleteObjectionSchema,
  objectionSchema,
  PRODUCT_FIELD_BY_DETAIL,
  productSchema,
  productStatusSchema,
  toProductPayload,
  updateObjectionSchema,
  updateProductSchema,
} from './schemas';

/**
 * Product actions (contracts/server-actions.md → "Productos"): auth → user_mutation → Zod →
 * seller of the personal organization → SQL function (authority) → revalidatePath/redirect.
 * Forms are controlled on the client, so a failure never loses what was typed; `values` carries the
 * scalar fields for completeness.
 */
const SCALAR_FIELDS = [
  'sector',
  'name',
  'description',
  'priceKind',
  'priceMin',
  'priceMax',
] as const;

function productInput(formData: FormData) {
  const raw = formValues(formData, [
    ...SCALAR_FIELDS,
    'idempotencyKey',
    'productId',
    'expectedVersion',
  ]);
  const list = (key: string) =>
    formData.getAll(key).filter((value): value is string => typeof value === 'string');
  return {
    ...raw,
    benefits: list('benefits'),
    differentiators: list('differentiators'),
    verifiableFacts: list('verifiableFacts'),
  };
}

function scalarValues(input: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of SCALAR_FIELDS) {
    const value = input[key];
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

/** 23514 from private.product_payload names the field in DETAIL. */
function productDbError(
  error: PostgrestLikeError & { details?: string | null },
  values: Record<string, string>,
  context: string,
) {
  if (error.code === '23514') {
    const field = PRODUCT_FIELD_BY_DETAIL[error.details ?? ''];
    if (field) {
      return fail('validation', { fieldErrors: { [field]: ['Revisa este campo.'] }, values });
    }
  }
  if (error.code === '42501') return { ...fail('suspended'), values };
  return { ...fromPostgresError(error, context), values };
}

export async function createProduct(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const input = productInput(formData);
  const values = scalarValues(input);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return { ...seller, values };

  let productId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('create_product', {
      p_org: seller.orgId,
      p_payload: toProductPayload(parsed.data),
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (error) return productDbError(error, values, 'createProduct');
    const row = data?.[0];
    if (!row)
      return {
        ...unexpected(new Error('create_product returned no row'), 'createProduct'),
        values,
      };
    productId = row.product_id;
  } catch (error) {
    return { ...unexpected(error, 'createProduct'), values };
  }
  revalidatePath('/productos');
  redirect(`/productos/${productId}?guardado=creado`);
}

export async function updateProduct(
  _prev: ActionResult<{ version: number; unchanged: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ version: number; unchanged: boolean }>> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const input = productInput(formData);
  const values = scalarValues(input);
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return { ...seller, values };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('update_product', {
      p_product: parsed.data.productId,
      p_expected_version: parsed.data.expectedVersion,
      p_payload: toProductPayload(parsed.data),
    });
    if (error) {
      if (error.code === 'P0010') {
        const { data: current } = await supabase
          .from('products')
          .select('current_version')
          .eq('id', parsed.data.productId)
          .maybeSingle();
        return fail('conflict', {
          message: current
            ? `Este producto cambió; recarga para ver la versión ${current.current_version}.`
            : 'Este producto cambió; recarga para ver la versión vigente.',
          details: { reason: 'version_mismatch' },
          values,
        });
      }
      return productDbError(error, values, 'updateProduct');
    }
    const row = data?.[0];
    if (!row)
      return {
        ...unexpected(new Error('update_product returned no row'), 'updateProduct'),
        values,
      };
    revalidatePath('/productos');
    revalidatePath(`/productos/${parsed.data.productId}`);
    return ok({ version: row.version, unchanged: row.unchanged });
  } catch (error) {
    return { ...unexpected(error, 'updateProduct'), values };
  }
}

export async function setProductStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = productStatusSchema.safeParse(formValues(formData, ['productId', 'status']));
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_product_status', {
      p_product: parsed.data.productId,
      p_status: parsed.data.status,
    });
    if (error) {
      if (error.code === '42501') return fail('suspended');
      return fromPostgresError(error, 'setProductStatus');
    }
    revalidatePath('/productos');
    revalidatePath(`/productos/${parsed.data.productId}`);
    return ok();
  } catch (error) {
    return unexpected(error, 'setProductStatus');
  }
}

// ------------------------------------------------------------------------------------- objections

const OBJECTION_LIMIT_MESSAGE = 'Alcanzaste el máximo de 20 objeciones para este producto.';

function objectionValues(formData: FormData) {
  return formValues(formData, ['productId', 'objectionId', 'text', 'category']);
}

function objectionDbError(
  error: PostgrestLikeError,
  values: Record<string, string>,
  context: string,
): ActionFailure {
  if (error.code === '23514') {
    return fail('validation', {
      fieldErrors: { text: ['Escribe la objeción (entre 5 y 300 caracteres).'] },
      values,
    });
  }
  if (error.code === 'P0010') {
    return fail('conflict', {
      message: OBJECTION_LIMIT_MESSAGE,
      details: { reason: 'objection_limit' },
      values,
    });
  }
  if (error.code === '42501') return { ...fail('suspended'), values };
  return { ...fromPostgresError(error, context), values };
}

function definedValues(raw: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export async function createObjection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const raw = objectionValues(formData);
  const values = definedValues(raw);
  const parsed = objectionSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return { ...seller, values };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('create_objection', {
      p_product: parsed.data.productId,
      p_text: parsed.data.text,
      p_category: parsed.data.category as Database['public']['Enums']['objection_category'],
    });
    if (error) return objectionDbError(error, values, 'createObjection');
    revalidatePath(`/productos/${parsed.data.productId}`);
    revalidatePath('/productos');
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'createObjection'), values };
  }
}

export async function updateObjection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const raw = objectionValues(formData);
  const values = definedValues(raw);
  const parsed = updateObjectionSchema.safeParse(raw);
  if (!parsed.success)
    return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error), values });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return { ...seller, values };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('update_objection', {
      p_objection: parsed.data.objectionId,
      p_text: parsed.data.text,
      p_category: parsed.data.category as Database['public']['Enums']['objection_category'],
    });
    if (error) return objectionDbError(error, values, 'updateObjection');
    revalidatePath(`/productos/${parsed.data.productId}`);
    return ok();
  } catch (error) {
    return { ...unexpected(error, 'updateObjection'), values };
  }
}

export async function deleteObjection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authenticateAction();
  if (!auth.ok) return auth;
  const parsed = deleteObjectionSchema.safeParse(
    formValues(formData, ['objectionId', 'productId']),
  );
  if (!parsed.success) return fail('validation', { fieldErrors: fieldErrorsOf(parsed.error) });
  const seller = authorizeSeller(auth.ctx);
  if ('ok' in seller) return seller;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('delete_objection', {
      p_objection: parsed.data.objectionId,
    });
    if (error) {
      if (error.code === '42501') return fail('suspended');
      return fromPostgresError(error, 'deleteObjection');
    }
    revalidatePath(`/productos/${parsed.data.productId}`);
    revalidatePath('/productos');
    return ok();
  } catch (error) {
    return unexpected(error, 'deleteObjection');
  }
}
