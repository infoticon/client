/**
 * The API declares no error schema at all — the OpenAPI document documents only
 * the `200` response for every operation — so unlike the response types there is
 * nothing here to derive from generated code. This union is therefore
 * hand-written, and is deliberately keyed off the HTTP status rather than off
 * any server-supplied string, because the server's message wording is not part
 * of any contract.
 *
 * If the API ever starts declaring error responses, replace this file with a
 * type derived from `types.gen.ts` — that is the preferred shape.
 */
export type ErrorCode =
  /** 400 — the path parameter failed the API's own validation. */
  | "validation_error"
  /** 401 — missing, malformed or unrecognised API key. */
  | "unauthorized"
  /** 404 — no such route. */
  | "not_found"
  /** 429 — throttled. The API itself has no rate limiting; this comes from the CDN in front of it. */
  | "rate_limited"
  /** 5xx — upstream provider failure or a server bug. The API does not distinguish the two. */
  | "server_error"
  /** The request never produced a response (DNS, TLS, timeout, offline). */
  | "network_error"
  /** A response arrived, but its status maps to none of the above. */
  | "unknown";

/** Maps an HTTP status to the coarse code a consumer can branch on. */
export const errorCodeFromStatus = (status: number): ErrorCode => {
  if (status === 400) return "validation_error";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unknown";
};
