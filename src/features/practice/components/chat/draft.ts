/**
 * Local draft of the composer (`cvia:draft:<sessionId>`): survives a closed tab or a sign-in again.
 * Storage may be unavailable (private mode, blocked site data): every access is guarded.
 */
const key = (sessionId: string) => `cvia:draft:${sessionId}`;

export function loadDraft(sessionId: string): string {
  try {
    return window.localStorage.getItem(key(sessionId)) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(sessionId: string, text: string): void {
  try {
    if (text) window.localStorage.setItem(key(sessionId), text);
    else window.localStorage.removeItem(key(sessionId));
  } catch {
    // storage unavailable: the draft only lives in memory
  }
}
