import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfoticonApiError } from "../errors.js";
import { parseErrorBody } from "./base.js";

// One level below `createBaseClient` is the generated fetch client. Stubbing it
// lets us capture the interceptor that turns a failed response into an SDK error
// and drive it directly, without a network round trip.
type ErrorInterceptor = (
  error: unknown,
  response: Response | undefined,
) => unknown | Promise<unknown>;

const errorInterceptors: ErrorInterceptor[] = [];
const createClientMock = vi.fn(() => ({
  interceptors: {
    response: { use: vi.fn() },
    error: { use: (fn: ErrorInterceptor) => errorInterceptors.push(fn) },
  },
}));

vi.mock("./generated/client/index.js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...(args as [])),
}));

const { createBaseClient } = await import("./base.js");

/** Builds the client and returns the error interceptor it registered. */
const interceptorFor = (
  options: Parameters<typeof createBaseClient>[0],
): ErrorInterceptor => {
  createBaseClient(options);
  const interceptor = errorInterceptors.at(-1);
  if (!interceptor) throw new Error("no error interceptor was registered");
  return interceptor;
};

describe("parseErrorBody", () => {
  // The deployed image decides which shape comes back, so both must work.
  it("should read the Fastify default shape", () => {
    expect(
      parseErrorBody(
        { statusCode: 401, error: "Unauthorized", message: "Invalid API key" },
        "fallback",
      ),
    ).toBe("Invalid API key");
  });

  it("should read the RFC 7807 shape", () => {
    expect(
      parseErrorBody(
        {
          type: "https://httpstatuses.com/401",
          title: "UnauthorizedError",
          status: 401,
          detail: "Missing X-API-Key header",
          instance: "/api/v2/emails/gmail.com",
        },
        "fallback",
      ),
    ).toBe("Missing X-API-Key header");
  });

  it("should fall back to title when RFC 7807 omits detail", () => {
    expect(parseErrorBody({ title: "Validation Error", status: 400 }, "fallback")).toBe(
      "Validation Error",
    );
  });

  it("should pass through a plain-text body", () => {
    expect(parseErrorBody("upstream timeout", "fallback")).toBe("upstream timeout");
  });

  it.each([[null], [undefined], [{}], [""], ["   "]])(
    "should use the fallback for an unusable body (%j)",
    (body) => {
      expect(parseErrorBody(body, "fallback")).toBe("fallback");
    },
  );
});

describe("createBaseClient", () => {
  beforeEach(() => {
    errorInterceptors.length = 0;
    vi.clearAllMocks();
  });

  it("should send the API key via the spec-declared security scheme", async () => {
    createBaseClient({ apiKey: "secret-key" });

    const config = createClientMock.mock.calls[0]?.[0] as {
      auth: () => string;
      throwOnError: boolean;
      baseUrl: string;
    };
    expect(config.auth()).toBe("secret-key");
    expect(config.throwOnError).toBe(true);
    expect(config.baseUrl).toBe("https://infoticon.prod.kubeticon.com");
  });

  it("should honour an explicit baseUrl", () => {
    createBaseClient({ apiKey: "k", baseUrl: "http://localhost:14492" });

    const config = createClientMock.mock.calls[0]?.[0] as { baseUrl: string };
    expect(config.baseUrl).toBe("http://localhost:14492");
  });

  it.each([
    [400, "validation_error"],
    [401, "unauthorized"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "server_error"],
    [418, "unknown"],
  ])("should map HTTP %i to the %s code", async (status, code) => {
    const interceptor = interceptorFor({ apiKey: "k" });

    const result = await interceptor({ message: "nope" }, { status } as Response);

    expect(result).toBeInstanceOf(InfoticonApiError);
    const error = result as InfoticonApiError;
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(status);
    expect(error.message).toBe("nope");
  });

  it("should map a missing response to a network error", async () => {
    const interceptor = interceptorFor({ apiKey: "k" });

    const result = await interceptor(new Error("timed out"), undefined);

    expect(result).toBeInstanceOf(InfoticonApiError);
    const error = result as InfoticonApiError;
    expect(error.code).toBe("network_error");
    expect(error.statusCode).toBe(0);
    expect(error.message).toContain("timed out");
  });

  it("should serialize to something loggable", async () => {
    const interceptor = interceptorFor({ apiKey: "k" });

    const error = (await interceptor(
      { message: "Invalid API key" },
      { status: 401 } as Response,
    )) as InfoticonApiError;

    // Without toJSON() this would be "{}".
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "InfoticonApiError",
      message: "Invalid API key",
      statusCode: 401,
      code: "unauthorized",
    });
  });
});
