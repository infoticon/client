import { DEFAULT_BASE_URL } from "../constants.js";
import { errorCodeFromStatus } from "../errorCodes.js";
import { InfoticonApiError } from "../errors.js";
import type { InfoticonClientOptions } from "../types.js";
import { createClient } from "./generated/client/index.js";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Reduces an error body to a message, tolerating both shapes the API is known to
 * emit. Which one you get depends on the deployed image, so neither can be
 * assumed:
 *
 *   Fastify default:  { statusCode, error, message }
 *   RFC 7807:         { type, title, status, detail, instance }
 *
 * Anything unrecognised (HTML from a proxy, plain text from the CDN, an empty
 * body) falls back to the caller-supplied status line.
 */
export const parseErrorBody = (body: unknown, fallback: string): string => {
  if (typeof body === "string" && body.trim() !== "") return body;

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    // RFC 7807 first: `detail` is the specific message, `title` the class of error.
    if (typeof record["detail"] === "string" && record["detail"] !== "") {
      return record["detail"];
    }
    if (typeof record["message"] === "string" && record["message"] !== "") {
      return record["message"];
    }
    if (typeof record["title"] === "string" && record["title"] !== "") {
      return record["title"];
    }
    if (typeof record["error"] === "string" && record["error"] !== "") {
      return record["error"];
    }
  }

  return fallback;
};

/**
 * The only place an HTTP client is constructed, and the only place a raw
 * transport failure becomes an SDK error. Timeouts belong here too — never in
 * individual endpoint wrappers.
 */
export const createBaseClient = (options: InfoticonClientOptions) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const client = createClient({
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    throwOnError: true,
    // The generated operations declare `security: [{ name: "X-API-Key", type: "apiKey" }]`,
    // so the header name comes from the spec rather than being hardcoded here.
    auth: () => options.apiKey,
    // A static `signal` would start its countdown when the client is created, not
    // when a request is sent, so the timeout is attached per call instead. This
    // matters: the API fans out to third-party providers (GUS, VIES, vpnapi) that
    // can hang for minutes.
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      }),
  });

  client.interceptors.response.use((response, request) => {
    options.logger?.debug(
      {
        request: { url: request.url, method: request.method },
        response: { status: response.status },
      },
      "Infoticon response received",
    );
    return response;
  });

  client.interceptors.error.use((error, response) => {
    // `response` is undefined when fetch itself rejected — DNS failure, TLS
    // error, offline, or the abort from the timeout above.
    if (!response) {
      const message = error instanceof Error ? error.message : String(error);
      return new InfoticonApiError(
        `Request to the Infoticon API failed: ${message}`,
        0,
        "network_error",
      );
    }

    return new InfoticonApiError(
      parseErrorBody(error, `Infoticon API responded with ${response.status}`),
      response.status,
      errorCodeFromStatus(response.status),
      response,
    );
  });

  return client;
};

export type BaseClient = ReturnType<typeof createBaseClient>;
