/**
 * Session policy constants (FR-019, research.md §R7). Mirror of `private.current_session_ok()`;
 * the database is the authority.
 */
export const SELLER_MAX_SESSION_DAYS = 30;
export const SELLER_MAX_INACTIVITY_DAYS = 7;
export const SUPERADMIN_MAX_SESSION_HOURS = 12;
