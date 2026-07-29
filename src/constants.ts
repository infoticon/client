/** Single source of truth for defaults. Never inline these values elsewhere. */

/**
 * Origin only — no `/api/v2`. The paths in the OpenAPI spec already carry that
 * prefix (`/api/v2/companies/{nip}`), so appending it here would produce
 * `/api/v2/api/v2/...`.
 */
export const DEFAULT_BASE_URL = "https://infoticon.prod.kubeticon.com";
