import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfoticonError } from "../errors.js";

// Mocked at the module boundary one level below the unit under test: the
// generated SDK. Mocking `fetch` instead would make these tests about HTTP
// rather than about the wrappers.
const getCompanyMock = vi.fn();
const getIpMock = vi.fn();
const getEmailDomainMock = vi.fn();
const getProductMock = vi.fn();

vi.mock("./generated/sdk.gen.js", () => ({
  getCompany: (...args: unknown[]) => getCompanyMock(...args),
  getIp: (...args: unknown[]) => getIpMock(...args),
  getEmailDomain: (...args: unknown[]) => getEmailDomainMock(...args),
  getProduct: (...args: unknown[]) => getProductMock(...args),
}));

// Dynamic import AFTER vi.mock, so the mock is registered first.
const { createInfoticonClient, getCompanyUpstreamErrors } = await import("./infoticon.js");

const OPTIONS = { apiKey: "test-key" } as const;

const COMPANY = {
  taxNumber: "1234567890",
  name: "Acme sp. z o.o.",
  street: "Testowa",
  buildingNumber: "1",
  premisesNumber: null,
  postalCode: "00-001",
  city: "Warszawa",
  country: "Polska",
  countryId: "PL",
  county: null,
  district: null,
  state: null,
  website: null,
  taxStatus: true,
  verifiedAt: "2026-07-29T00:00:00.000Z",
  sources: { gus: "ok", vat: "ok" },
};

describe("createInfoticonClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject an empty API key before making any request", () => {
    expect(() => createInfoticonClient({ apiKey: "" })).toThrow(InfoticonError);
    expect(getCompanyMock).not.toHaveBeenCalled();
  });

  describe("getCompany", () => {
    it("should pass the tax number as a path parameter and unwrap data", async () => {
      getCompanyMock.mockResolvedValue({ data: COMPANY });

      const client = createInfoticonClient(OPTIONS);
      const result = await client.getCompany("PL1234567890");

      expect(result).toEqual(COMPANY);
      expect(getCompanyMock).toHaveBeenCalledTimes(1);
      expect(getCompanyMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: { nip: "PL1234567890" } }),
      );
    });

    it("should propagate errors from the generated operation unchanged", async () => {
      const failure = new Error("boom");
      getCompanyMock.mockRejectedValue(failure);

      const client = createInfoticonClient(OPTIONS);

      await expect(client.getCompany("PL1234567890")).rejects.toBe(failure);
    });
  });

  describe("getIp", () => {
    it("should pass the address as a path parameter", async () => {
      getIpMock.mockResolvedValue({ data: { ip: "1.2.3.4" } });

      const client = createInfoticonClient(OPTIONS);
      const result = await client.getIp("1.2.3.4");

      expect(result).toEqual({ ip: "1.2.3.4" });
      expect(getIpMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: { address: "1.2.3.4" } }),
      );
    });
  });

  describe("getEmailDomain", () => {
    it("should pass the domain as a path parameter", async () => {
      getEmailDomainMock.mockResolvedValue({ data: { domain: "gmail.com", disposable: false } });

      const client = createInfoticonClient(OPTIONS);
      const result = await client.getEmailDomain("gmail.com");

      expect(result).toEqual({ domain: "gmail.com", disposable: false });
      expect(getEmailDomainMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: { domain: "gmail.com" } }),
      );
    });
  });

  describe("getProduct", () => {
    it("should pass the EAN as a path parameter", async () => {
      getProductMock.mockResolvedValue({ data: { ean: "5901234123457", name: "Test" } });

      const client = createInfoticonClient(OPTIONS);
      const result = await client.getProduct("5901234123457");

      expect(result).toEqual({ ean: "5901234123457", name: "Test" });
      expect(getProductMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: { ean: "5901234123457" } }),
      );
    });
  });
});

describe("getCompanyUpstreamErrors", () => {
  it("should report nothing for a fully resolved company", () => {
    expect(getCompanyUpstreamErrors(COMPANY)).toEqual([]);
  });

  it("should report the GUS failure that a 200 response would otherwise hide", () => {
    expect(
      getCompanyUpstreamErrors({ sources: { gus: "unavailable", vat: "ok" } }),
    ).toEqual([{ source: "gus", status: "unavailable" }]);
  });

  it("should report both sources independently", () => {
    expect(
      getCompanyUpstreamErrors({ sources: { gus: "not_found", vat: "not_found" } }),
    ).toEqual([
      { source: "gus", status: "not_found" },
      { source: "vat", status: "not_found" },
    ]);
  });

  // A foreign tax number legitimately has no GUS entry — that is the expected
  // outcome, not a degradation, so it must not be reported as a problem.
  it("should not report not_applicable as a problem", () => {
    expect(
      getCompanyUpstreamErrors({ sources: { gus: "not_applicable", vat: "ok" } }),
    ).toEqual([]);
  });
});
