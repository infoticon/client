# @infoticon/client

Typed TypeScript client for the [Infoticon API v2](https://infoticon.prod.kubeticon.com/api/v2/documentation)
— company lookups by tax number (NIP), IP geolocation with VPN/proxy/Tor detection, disposable
email-domain checks, product lookups by EAN barcode, plus country, exchange-rate and card-BIN
dictionaries.

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
const country = await infoticon.getCountry("PL");
const rate = await infoticon.getExchangeRate("PLN", "EUR");
const card = await infoticon.getCard("453201"); // BIN only — never a full card number
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
| `getCountry(id)` | Country dictionary entry by ISO 3166-1 alpha-2 code — the same code `getIp` returns as `countryCode`. |
| `getExchangeRate(from, to)` | Latest rate for a currency pair, as a decimal. Directional. |
| `getCard(bin)` | Card issuer data by BIN/IIN — the first 6–11 digits of a card number. |

Response types are exported as `Company`, `IpInfo`, `EmailDomain`, `Product`, `Country`,
`ExchangeRate` and `Card`.

The last three are served from Infoticon's own data rather than an external registry, so they
never fail with an upstream error — only `not_found` for something the dictionary does not hold.

### A partial company still resolves — check the upstream flags

`getCompany` rejects with `not_found` only when NO registry knows the tax number. When one
registry answers and the other does not, you get a `200` with the missing fields left null and
`sources` recording what each registry did. Treating a resolved promise as "complete" will
silently accept partial records, so check explicitly:

```ts
import { createInfoticonClient, getCompanyUpstreamErrors } from "@infoticon/client";

const company = await infoticon.getCompany("PL1234567890");
const problems = getCompanyUpstreamErrors(company);

if (problems.length > 0) {
  // [{ source: "gus", status: "unavailable" }]
  console.warn({ problems }, "company data is incomplete");
}
```

`sources.vat` covers the VAT whitelist / VIES lookup and `sources.gus` the GUS registry. One can
fail while the other succeeds, which is why the result is a list. A `not_applicable` status — GUS
for a foreign tax number — is deliberately not reported as a problem.

### Never send a full card number

`getCard` takes the BIN only: the first 6 to 11 digits. Anything longer is rejected with
`validation_error`, because the API logs request paths and a PAN must never travel in one. Truncate
on your side; the lookup ignores everything past the 11th digit anyway. Where several prefixes
match, the longest one wins.

Only `prefix` and `organization` are always present — the rest of the fields are nullable in the
underlying registry.

### Exchange rates are directional

`getExchangeRate("PLN", "EUR")` is a different value from `getExchangeRate("EUR", "PLN")`, and
neither is derived from the other. Requesting the same code twice, or a pair the nightly import has
not covered, rejects with `not_found`.

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
| `not_found` | 404 | The subject is not in the registry — an unknown EAN, tax number, country code or card prefix. |
| `rate_limited` | 429 | From the CDN in front of the API — the API itself does not rate limit. |
| `server_error` | 5xx | Check `statusCode`: `502`/`503` are upstream provider failures, `500` is a bug in the API. |
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

- **A missing subject is distinguishable from an outage.** An unknown EAN, tax number, country code
  or card prefix answers `404`; a provider that failed or is misconfigured answers `502`/`503`.
  Both surface as different codes, so you can retry an outage without retrying a `not_found`.
- **5xx detail is scrubbed.** The API never leaks an upstream exception message, so `server_error`
  carries a deliberately short description. Branch on `statusCode`, not on the text.
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
