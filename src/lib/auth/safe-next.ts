/**
 * Accepts only internal paths for `?next=` (contracts/routes.md): must start with a single `/`,
 * no `//`, no backslashes, no scheme, no control characters. Returns null otherwise.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 512) return null;
  if (!candidate.startsWith('/')) return null;
  if (candidate.startsWith('//')) return null;
  if (candidate.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return null;
  if (/^\/[^/?#]*:/.test(candidate)) return null;
  try {
    const url = new URL(candidate, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
