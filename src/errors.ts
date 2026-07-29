import type { ErrorCode } from "./errorCodes.js";

/** Base class — one `instanceof` check tells a consumer the error came from this SDK. */
export class InfoticonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Every failed request becomes one of these, in exactly one place:
 * `clients/base.ts`. `statusCode` is `0` when the request never reached the
 * server (see `code: "network_error"`).
 */
export class InfoticonApiError extends InfoticonError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    public readonly response?: Response,
  ) {
    super(message);
  }

  /** Without this, logging the error serializes to `{}`. */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
    };
  }
}

export function isInfoticonError(error: unknown): error is InfoticonError {
  return error instanceof InfoticonError;
}

export function isInfoticonApiError(error: unknown): error is InfoticonApiError {
  return error instanceof InfoticonApiError;
}

/**
 * Narrows to a specific literal code, so `error.code` is that literal inside the
 * branch instead of the whole union:
 *
 *   if (isApiCodeError(error, "unauthorized")) { ... }
 */
export function isApiCodeError<C extends ErrorCode>(
  error: unknown,
  code: C,
): error is InfoticonApiError & { code: C } {
  return error instanceof InfoticonApiError && error.code === code;
}
