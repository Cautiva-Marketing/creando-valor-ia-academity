/** Session limits (FR-023, FR-027, FR-028). The database enforces the same numbers. */
export const PRACTICE_LIMITS = {
  maxSellerMessages: 20,
  sessionMinutes: 20,
  maxMessageChars: 1000,
  /** "Te quedan 3 mensajes". */
  warnMessagesLeft: 3,
  /** "Quedan 3 minutos". */
  warnMinutesLeft: 3,
  /** Interest change per turn is clamped to ±15. */
  maxInterestDelta: 15,
} as const;
