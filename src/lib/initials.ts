/**
 * Initials for the avatar (research.md §R14): grapheme-aware (accents, ñ, emoji), at most 2,
 * never empty ("?" fallback).
 */
const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

function firstGrapheme(word: string): string {
  for (const { segment } of segmenter.segment(word)) return segment;
  return '';
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = firstGrapheme(words[0]!);
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1]!) : '';
  const result = `${first}${last}`.toLocaleUpperCase('es');
  return result || '?';
}
