import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/seller';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';
import type { ProductListQuery } from './schemas';

/** Reads of /productos (RLS: products of the seller's active organizations; contracts/routes.md). */
type Enums = Database['public']['Enums'];
export const PRODUCTS_PAGE_SIZE = 20;

export interface ProductVersionContent {
  version: number;
  sector: Enums['product_sector'];
  name: string;
  description: string;
  priceKind: Enums['price_kind'];
  priceMin: number;
  priceMax: number;
  benefits: string[];
  differentiators: string[];
  verifiableFacts: string[];
  createdAt: string;
}

export interface ProductListRow {
  id: string;
  name: string;
  status: Enums['product_status'];
  currentVersion: number;
  sector: Enums['product_sector'] | null;
  priceMin: number | null;
  priceMax: number | null;
  objectionCount: number;
}

const VERSION_COLUMNS =
  'product_id, version, sector, name, description, price_kind, price_min, price_max, benefits, differentiators, verifiable_facts, created_at';

type VersionRow = Pick<
  Database['public']['Tables']['product_versions']['Row'],
  | 'product_id'
  | 'version'
  | 'sector'
  | 'name'
  | 'description'
  | 'price_kind'
  | 'price_min'
  | 'price_max'
  | 'benefits'
  | 'differentiators'
  | 'verifiable_facts'
  | 'created_at'
>;

function toContent(row: VersionRow): ProductVersionContent {
  return {
    version: row.version,
    sector: row.sector,
    name: row.name,
    description: row.description,
    priceKind: row.price_kind,
    priceMin: Number(row.price_min),
    priceMax: Number(row.price_max),
    benefits: row.benefits,
    differentiators: row.differentiators,
    verifiableFacts: row.verifiable_facts,
    createdAt: row.created_at,
  };
}

/** `%`, `_` and `\` are literal in the seller's search text. */
function likePattern(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listProducts(query: ProductListQuery) {
  const { ctx, orgId } = await requireSeller('/productos');
  const supabase = await createClient();
  const from = (query.pagina - 1) * PRODUCTS_PAGE_SIZE;

  let request = supabase
    .from('products')
    .select('id, status, current_version, current_name', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('status', query.estado === 'archivados' ? 'archived' : 'active');
  if (query.q) request = request.ilike('current_name', likePattern(query.q));
  const { data, count, error } = await request
    .order('updated_at', { ascending: false })
    .order('id')
    .range(from, from + PRODUCTS_PAGE_SIZE - 1);
  if (error) throw new Error(`products list failed (${error.code})`);

  const products = data ?? [];
  const ids = products.map((p) => p.id);
  const [versions, objections] = ids.length
    ? await Promise.all([
        supabase
          .from('product_versions')
          .select('product_id, version, sector, price_min, price_max')
          .in('product_id', ids),
        supabase.from('objections').select('product_id').in('product_id', ids),
      ])
    : [null, null];
  if (versions?.error) throw new Error(`product versions failed (${versions.error.code})`);
  if (objections?.error) throw new Error(`objection counts failed (${objections.error.code})`);

  const rows: ProductListRow[] = products.map((p) => {
    const current = versions?.data?.find(
      (v) => v.product_id === p.id && v.version === p.current_version,
    );
    return {
      id: p.id,
      name: p.current_name,
      status: p.status,
      currentVersion: p.current_version,
      sector: current?.sector ?? null,
      priceMin: current ? Number(current.price_min) : null,
      priceMax: current ? Number(current.price_max) : null,
      objectionCount: objections?.data?.filter((o) => o.product_id === p.id).length ?? 0,
    };
  });

  const total = count ?? 0;
  // First run = the seller has no product at all (archived ones included).
  let hasAnyProduct = total > 0;
  if (!hasAnyProduct) {
    const { count: all, error: allError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (allError) throw new Error(`products count failed (${allError.code})`);
    hasAnyProduct = (all ?? 0) > 0;
  }
  return {
    rows,
    total,
    hasAnyProduct,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    timezone: ctx.timezone,
  };
}

export interface ProductDetail {
  id: string;
  status: Enums['product_status'];
  archivedAt: string | null;
  current: ProductVersionContent;
  versions: ProductVersionContent[];
  timezone: string;
}

/** Current version + all versions (newest first). Foreign or unknown ids → notFound(). */
export async function getProduct(id: string): Promise<ProductDetail> {
  const { ctx, orgId } = await requireSeller(`/productos/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from('products')
    .select('id, status, archived_at, current_version')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`product read failed (${error.code})`);
  if (!product) notFound();

  const { data: versions, error: versionsError } = await supabase
    .from('product_versions')
    .select(VERSION_COLUMNS)
    .eq('product_id', id)
    .order('version', { ascending: false });
  if (versionsError) throw new Error(`product versions failed (${versionsError.code})`);
  const all = (versions ?? []).map(toContent);
  const current = all.find((v) => v.version === product.current_version);
  if (!current) throw new Error('product without current version');

  return {
    id: product.id,
    status: product.status,
    archivedAt: product.archived_at,
    current,
    versions: all,
    timezone: ctx.timezone,
  };
}

export interface ObjectionRow {
  id: string;
  text: string;
  category: Enums['objection_category'] | null;
  createdAt: string;
}

/** Objections of a product of the seller's organization, oldest first (FR-006). */
export async function listObjections(productId: string): Promise<ObjectionRow[]> {
  const { orgId } = await requireSeller(`/productos/${productId}`);
  if (!z.uuid().safeParse(productId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('objections')
    .select('id, text, category, created_at')
    .eq('product_id', productId)
    .eq('organization_id', orgId)
    .order('created_at')
    .order('id');
  if (error) throw new Error(`objections read failed (${error.code})`);
  return (data ?? []).map((o) => ({
    id: o.id,
    text: o.text,
    category: o.category,
    createdAt: o.created_at,
  }));
}
