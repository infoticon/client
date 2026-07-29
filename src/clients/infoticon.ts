import { InfoticonError } from "../errors.js";
import type { InfoticonClientOptions } from "../types.js";
import { createBaseClient } from "./base.js";
// Operations come from sdk.gen.js, parameter and response types from types.gen.js.
// This file is the ONLY place allowed to import generated code, and the generated
// barrel is never re-exported — otherwise every regeneration could break the
// package's public API.
import {
  getCompany,
  getEmailDomain,
  getIp,
  getProduct,
} from "./generated/sdk.gen.js";
import type {
  GetCompanyData,
  GetCompanyResponses,
  GetEmailDomainData,
  GetEmailDomainResponses,
  GetIpData,
  GetIpResponses,
  GetProductData,
  GetProductResponses,
} from "./generated/types.gen.js";

/** Response payloads, derived from the spec rather than restated by hand. */
export type Company = GetCompanyResponses[200];
export type IpInfo = GetIpResponses[200];
export type EmailDomain = GetEmailDomainResponses[200];
export type Product = GetProductResponses[200];

/**
 * `getCompany` never returns 404. A tax number the registries do not know still
 * comes back as `200`, with `name: ""`, null address fields and the relevant
 * `*Error` flag set. Callers that treat a resolved promise as "found" will
 * silently accept empty records, so this helper makes the partial-failure case
 * explicit:
 *
 *   const company = await client.getCompany("PL1234567890");
 *   const problems = getCompanyUpstreamErrors(company);
 *   if (problems.length > 0) { ... }
 *
 * `vatError` covers the VAT whitelist / VIES lookup, `gusError` the GUS registry.
 * One can fail while the other succeeds, so the result is a list.
 */
export const getCompanyUpstreamErrors = (
  company: Pick<Company, "vatError" | "vatErrorMessage" | "gusError" | "gusErrorMessage">,
): ReadonlyArray<{ source: "vat" | "gus"; message: string }> => {
  const problems: Array<{ source: "vat" | "gus"; message: string }> = [];
  if (company.vatError) problems.push({ source: "vat", message: company.vatErrorMessage });
  if (company.gusError) problems.push({ source: "gus", message: company.gusErrorMessage });
  return problems;
};

/**
 * The API has exactly one authentication scheme (`apiKey`), so there is one
 * factory. Should a second scheme ever appear, add a sibling factory rather than
 * an `auth` switch here — separate factories make it impossible to call an
 * endpoint with the wrong credential.
 *
 * Path parameters are positional, because `getCompany("PL123…")` reads better
 * than `getCompany({ path: { nip: "PL123…" } })` and the types still come from
 * the spec.
 */
export const createInfoticonClient = (options: InfoticonClientOptions) => {
  if (!options.apiKey) {
    // Fail here rather than letting the API answer 401 — the message is clearer,
    // and it costs a round trip to learn the same thing.
    throw new InfoticonError("An Infoticon API key is required (options.apiKey was empty).");
  }

  const client = createBaseClient(options);

  return {
    /**
     * Company data by tax number (NIP), optionally country-prefixed
     * (`PL1234567890`). Non-Polish prefixes are resolved through VIES.
     *
     * Never rejects for an unknown company — check `getCompanyUpstreamErrors`.
     */
    getCompany: async (nip: GetCompanyData["path"]["nip"]): Promise<Company> => {
      const { data } = await getCompany({ client, path: { nip } });
      return data;
    },

    /** Geolocation plus VPN/proxy/Tor/relay detection for an IPv4 address. */
    getIp: async (address: GetIpData["path"]["address"]): Promise<IpInfo> => {
      const { data } = await getIp({ client, path: { address } });
      return data;
    },

    /**
     * Whether a domain belongs to a disposable-email provider.
     * Takes a bare domain (`gmail.com`), not a full address.
     */
    getEmailDomain: async (
      domain: GetEmailDomainData["path"]["domain"],
    ): Promise<EmailDomain> => {
      const { data } = await getEmailDomain({ client, path: { domain } });
      return data;
    },

    /**
     * Product data by EAN/GTIN barcode (8–14 digits).
     *
     * An unknown barcode currently surfaces as a `server_error`, not a
     * `not_found` — the API does not distinguish "no such product" from an
     * upstream failure.
     */
    getProduct: async (ean: GetProductData["path"]["ean"]): Promise<Product> => {
      const { data } = await getProduct({ client, path: { ean } });
      return data;
    },
  };
};

export type InfoticonClient = ReturnType<typeof createInfoticonClient>;
