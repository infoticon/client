/**
 * Public types. Anything a consumer can pass in or receive back is declared here.
 * Types that describe the API itself are derived from the generated code instead
 * — see `clients/infoticon.ts`.
 */

/**
 * Structural, so a pino/winston/console-shaped logger satisfies it with no
 * adapter. Deliberately not imported from a logging library — that would drag
 * one into the dependency tree of every consumer.
 */
export interface SdkLogger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  child(bindings: Record<string, unknown>): SdkLogger;
}

export type InfoticonClientOptions = {
  /** API key, sent as the `X-API-Key` header. Every endpoint requires it. */
  readonly apiKey: string;
  /** Origin without the `/api/v2` prefix. Defaults to `DEFAULT_BASE_URL`. */
  readonly baseUrl?: string;
  /** Optional structural logger; one debug line per response when supplied. */
  readonly logger?: SdkLogger;
  /** Per-request timeout in milliseconds. Defaults to 30_000. */
  readonly timeoutMs?: number;
};
