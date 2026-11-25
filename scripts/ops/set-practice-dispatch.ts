/**
 * Loads the evaluation dispatcher configuration into Supabase Vault (T156; research.md §R8;
 * scripts/ops/README.md). Run ONLY with the user's explicit approval (T197):
 *
 *   pnpm tsx --env-file=<archivo> scripts/ops/set-practice-dispatch.ts --project-ref <ref>
 *
 * Environment:
 *   SUPABASE_ACCESS_TOKEN      personal access token (Management API), never printed
 *   SUPABASE_PROJECT_REF       project ref; must match --project-ref (explicit confirmation)
 *   PRACTICE_DISPATCH_URL      public https URL of the app (e.g. https://app.example.com)
 *   PRACTICE_DISPATCH_SECRET   ≥ 32 bytes; the same value as the Vercel variable; never printed
 *
 * Creates or updates the Vault secrets `practice_dispatch_url` and `practice_dispatch_secret`. Values
 * travel only in the request body (never in argv, logs or migrations).
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fail, requireEnv } from './lib';

const { values } = parseArgs({ options: { 'project-ref': { type: 'string' } } });

const token = requireEnv('SUPABASE_ACCESS_TOKEN');
const projectRef = requireEnv('SUPABASE_PROJECT_REF');
const url = requireEnv('PRACTICE_DISPATCH_URL').trim().replace(/\/+$/, '');
const secret = requireEnv('PRACTICE_DISPATCH_SECRET');

if (values['project-ref'] !== projectRef) {
  fail('Confirma el proyecto con --project-ref igual a SUPABASE_PROJECT_REF.');
}
let parsedUrl: URL;
try {
  parsedUrl = new URL(url);
} catch {
  fail('PRACTICE_DISPATCH_URL no es una URL válida.');
}
if (parsedUrl.protocol !== 'https:' || parsedUrl.pathname !== '/') {
  fail('PRACTICE_DISPATCH_URL debe ser el origen https de la app, sin ruta.');
}
if (Buffer.byteLength(secret, 'utf8') < 32) {
  fail('PRACTICE_DISPATCH_SECRET debe tener al menos 32 bytes.');
}

/** Dollar-quoted literal with a random tag that does not occur in the value. */
function literal(value: string): string {
  let tag: string;
  do {
    tag = `v${randomBytes(6).toString('hex')}`;
  } while (value.includes(`$${tag}$`));
  return `$${tag}$${value}$${tag}$`;
}

function upsert(name: string, value: string, description: string): string {
  return `
select vault.update_secret(s.id, ${literal(value)}) from vault.secrets s where s.name = '${name}';
select vault.create_secret(${literal(value)}, '${name}', '${description}')
 where not exists (select 1 from vault.secrets s where s.name = '${name}');`;
}

const query = [
  upsert('practice_dispatch_url', parsedUrl.origin, 'Practice evaluation dispatcher base URL'),
  upsert('practice_dispatch_secret', secret, 'Practice evaluation dispatcher bearer secret'),
  "select count(*)::int as secrets from vault.secrets where name in ('practice_dispatch_url', 'practice_dispatch_secret');",
].join('\n');

console.warn(`Proyecto: ${projectRef} · URL del despachador: ${parsedUrl.origin}`);

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!response.ok) {
  fail(`La Management API respondió ${response.status}. No se cambió nada visible aquí.`);
}
const rows = (await response.json()) as Array<{ secrets?: number }>;
const count = rows.at(-1)?.secrets;
if (count !== 2) fail(`Se esperaban 2 secretos en Vault y hay ${String(count)}.`);
console.warn('Vault actualizado: practice_dispatch_url y practice_dispatch_secret.');
console.warn(
  'Siguiente paso: confirma que PRACTICE_DISPATCH_SECRET en Vercel tiene el mismo valor y revisa net._http_response.',
);
