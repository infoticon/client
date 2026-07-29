# @infoticon/client

Typed TypeScript client for the [Infoticon API v2](https://infoticon.prod.kubeticon.com/api/v2/documentation)
— company lookups by tax number (NIP), IP geolocation with VPN/proxy/Tor detection, disposable
email-domain checks and product lookups by EAN barcode.

Runs on **Node.js / server runtimes only**. There is no browser build on purpose: the sole
authentication scheme is an API key, which must not be shipped in a bundle, and the API sends no
CORS headers, so a browser could not call it directly anyway. To use Infoticon data in a browser,
proxy it through your own server.

Request and response types are generated from the API's OpenAPI document, so a change to the API
surfaces as a compile error rather than a runtime surprise.

## Installation

```bash
npm install @infoticon/client
```

Requires **Node.js >= 20**.

## Quick start

```ts
import { createInfoticonClient } from "@infoticon/client";

const infoticon = createInfoticonClient({ apiKey: process.env.INFOTICON_API_KEY! });

const company = await infoticon.getCompany("PL1234567890");
const ip = await infoticon.getIp("8.8.8.8");
const domain = await infoticon.getEmailDomain("gmail.com");
const product = await infoticon.getProduct("5901234123457");
```

## Configuration

```ts
type InfoticonClientOptions = {
  /** API key, sent as the `X-API-Key` header. Every endpoint requires it. */
  readonly apiKey: string;
  /** Origin without the `/api/v2` prefix. Default: "https://infoticon.prod.kubeticon.com" */
  readonly baseUrl?: string;
  /** Optional structural logger; one debug line per response when supplied. Default: none */
  readonly logger?: SdkLogger;
  /** Per-request timeout in milliseconds. Default: 30000 */
  readonly timeoutMs?: number;
};
```

`logger` is structural — a `pino` instance satisfies it with no adapter:

```ts
import pino from "pino";

const infoticon = createInfoticonClient({
  apiKey: process.env.INFOTICON_API_KEY!,
  logger: pino(),
  timeoutMs: 10_000,
});
```

Point `baseUrl` at a development deployment when you need one:

```ts
createInfoticonClient({ apiKey, baseUrl: "https://infoticon-v2-dev.dev.kubeticon.com" });
```

## API

| Method | Description |
|---|---|
| `getCompany(nip)` | Company data by tax number, optionally country-prefixed (`PL1234567890`). Non-Polish prefixes resolve through VIES. |
| `getIp(address)` | Geolocation plus VPN/proxy/Tor/relay detection for an IPv4 address. |
| `getEmailDomain(domain)` | Whether a domain belongs to a disposable-email provider. Takes a bare domain, not a full address. |
| `getProduct(ean)` | Product data by EAN/GTIN barcode (8–14 digits). |

Response types are exported as `Company`, `IpInfo`, `EmailDomain` and `Product`.

### Companies never 404 — check the upstream flags

`getCompany` resolves even when the registries know nothing about the tax number. You get a `200`
with `name: ""`, null address fields, and the relevant error flag set. Treating a resolved promise
as "found" will silently accept empty records, so check explicitly:

```ts
import { createInfoticonClient, getCompanyUpstreamErrors } from "@infoticon/client";

const company = await infoticon.getCompany("PL0000000000");
const problems = getCompanyUpstreamErrors(company);

if (problems.length > 0) {
  // [{ source: "gus", message: "Entity not found in GUS" }]
  console.warn({ problems }, "company data is incomplete");
}
```

`vatError` covers the VAT whitelist / VIES lookup and `gusError` the GUS registry. One can fail
while the other succeeds, which is why the result is a list.

## Error handling

Every failed request rejects with an `InfoticonApiError`.

| Class | Meaning |
|---|---|
| `InfoticonError` | Base class. One `instanceof` check identifies any error from this SDK. |
| `InfoticonApiError` | A request failed. Carries `statusCode`, `code`, and the raw `response`. |

| Guard | Narrows to |
|---|---|
| `isInfoticonError(e)` | `InfoticonError` |
| `isInfoticonApiError(e)` | `InfoticonApiError` |
| `isApiCodeError(e, code)` | `InfoticonApiError` with `code` narrowed to that literal |

| `code` | Status | Notes |
|---|---|---|
| `validation_error` | 400 | The path parameter failed the API's validation (e.g. an EAN shorter than 8 characters). |
| `unauthorized` | 401, 403 | Missing, malformed or unrecognised API key. |
| `not_found` | 404 | No such route. |
| `rate_limited` | 429 | From the CDN in front of the API — the API itself does not rate limit. |
| `server_error` | 5xx | Upstream provider failure **or** a server bug; the API does not distinguish them. |
| `network_error` | — | No response at all: DNS, TLS, offline, or the client-side timeout. `statusCode` is `0`. |
| `unknown` | other | A response arrived whose status maps to none of the above. |

```ts
import { isApiCodeError, isInfoticonApiError } from "@infoticon/client";

try {
  await infoticon.getProduct("5901234123457");
} catch (error) {
  if (isApiCodeError(error, "unauthorized")) {
    throw new Error("Check INFOTICON_API_KEY");
  }
  if (isInfoticonApiError(error)) {
    console.error(error.toJSON()); // plain object — logging the error directly gives "{}"
  }
  throw error;
}
```

### Known API behaviours worth planning around

- **An unknown EAN returns `server_error`, not `not_found`.** The API raises a generic failure for
  a barcode it cannot resolve, and scrubs the detail from 5xx messages, so an unknown product is
  indistinguishable from an upstream outage.
- **`getIp` and `getEmailDomain` surface provider outages as `server_error`** for the same reason.
- **The API applies no rate limiting of its own.** Any `429` originates from the CDN in front of it.
- **Authentication is checked before routing**, so an unknown path answers `401`, not `404`.

## Keeping the client in sync with the API

The generated code under `src/clients/generated/` is derived from `openapi.json`; both are committed
so a fresh clone builds without the API being reachable. Never hand-edit the generated directory —
change the API's schemas, then regenerate:

```bash
npm run codegen:fetch   # pull the live spec, then regenerate
npm run codegen         # regenerate from the committed openapi.json
```

`codegen:fetch` reads `OPENAPI_URL`, defaulting to the production documentation endpoint. The spec
can also be produced straight from the API source without a deployment — see `yarn spec:dump` in
`infoticon/backend-v2`, which is how to regenerate this client in the same PR that changes the API.

## License

MIT
