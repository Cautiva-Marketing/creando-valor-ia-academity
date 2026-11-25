#!/usr/bin/env node
/**
 * Fails if any server secret reaches the client bundle (.next/static), research.md §R22.
 * Looks for the literal values of the secret env vars (when set), the `sb_secret_` key pattern and
 * the Google API key pattern (`AIza…`, 002).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const STATIC_DIR = join(ROOT, '.next', 'static');
const SECRET_VARS = [
  'SUPABASE_SECRET_KEY',
  'SMTP_PASS',
  'RATE_LIMIT_PEPPER',
  'SEND_EMAIL_HOOK_SECRET',
  // 002: Gemini key and internal dispatcher secret (plan.md → Constitution Check, Principle II)
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'PRACTICE_DISPATCH_SECRET',
];
// `AIza…` is the shape of a Google API key.
const PATTERNS = [/sb_secret_[A-Za-z0-9_-]{8,}/, /AIza[0-9A-Za-z_-]{35}/];

if (!existsSync(STATIC_DIR)) {
  console.error('check-bundle-secrets: .next/static not found — run `pnpm build` first.');
  process.exit(2);
}

const needles = SECRET_VARS.flatMap((name) => {
  const value = process.env[name];
  if (!value || value.length < 8) return [];
  // The hook secret is stored as "v1,whsec_<base64>"; also look for the bare base64 part.
  const parts = [value, ...value.split(/[,_]/).filter((p) => p.length >= 16)];
  return parts.map((needle) => ({ name, needle }));
});

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const findings = [];
let scanned = 0;
for (const file of walk(STATIC_DIR)) {
  if (!/\.(js|mjs|css|json|html|map|txt)$/.test(file)) continue;
  scanned += 1;
  const content = readFileSync(file, 'utf8');
  for (const { name, needle } of needles) {
    if (content.includes(needle)) findings.push(`${relative(ROOT, file)}: value of ${name}`);
  }
  for (const pattern of PATTERNS) {
    if (pattern.test(content)) findings.push(`${relative(ROOT, file)}: matches ${pattern}`);
  }
}

if (findings.length > 0) {
  console.error('check-bundle-secrets: server secrets found in the client bundle:');
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.warn(
  `check-bundle-secrets: OK (${scanned} files, ${needles.length} secret values + ${PATTERNS.length} patterns checked)`,
);
