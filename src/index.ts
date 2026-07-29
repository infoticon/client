/**
 * Node/server entry point — the only one.
 *
 * There is deliberately no browser build: the sole authentication scheme is an
 * API key, which must not be shipped in a bundle, and the API sends no CORS
 * headers, so a browser could not call it directly anyway. To use Infoticon data
 * in a browser, proxy it through your own server.
 */
export {
  createInfoticonClient,
  getCompanyUpstreamErrors,
  type Company,
  type EmailDomain,
  type InfoticonClient,
  type IpInfo,
  type Product,
} from "./clients/infoticon.js";

export { DEFAULT_BASE_URL } from "./constants.js";
export { errorCodeFromStatus, type ErrorCode } from "./errorCodes.js";
export {
  InfoticonApiError,
  InfoticonError,
  isApiCodeError,
  isInfoticonApiError,
  isInfoticonError,
} from "./errors.js";
export type { InfoticonClientOptions, SdkLogger } from "./types.js";
