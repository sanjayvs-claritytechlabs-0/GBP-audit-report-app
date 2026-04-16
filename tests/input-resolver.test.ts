import { describe, it, expect } from "vitest";

/**
 * Tests for GBP URL parsing. These test the URL pattern matching logic
 * without making actual HTTP calls (which require API keys).
 */

const GBP_URL_PATTERNS = {
  shortUrl: /^https?:\/\/maps\.app\.goo\.gl\/.+$/i,
  fullMapsUrl: /^https?:\/\/(www\.)?google\.\w+\/maps\/place\/.+$/i,
  cidParamUrl: /^https?:\/\/maps\.google\.\w+\/?\?.*cid=\d+/i,
  gbpDirectUrl: /^https?:\/\/business\.google\.com\/n\/\d+\/profile/i,
};

function classifyGbpUrl(url: string): string | null {
  if (GBP_URL_PATTERNS.shortUrl.test(url)) return "short";
  if (GBP_URL_PATTERNS.fullMapsUrl.test(url)) return "full_maps";
  if (GBP_URL_PATTERNS.cidParamUrl.test(url)) return "cid_param";
  if (GBP_URL_PATTERNS.gbpDirectUrl.test(url)) return "gbp_direct";
  return null;
}

function extractCidFromUrl(url: string): string | null {
  // From data= param: ...0x hex CID
  const hexMatch = url.match(/0x([0-9a-f]+)/i);
  if (hexMatch) return hexMatch[1];

  // From ?cid= param
  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch) return cidMatch[1];

  return null;
}

function extractLocationIdFromGbp(url: string): string | null {
  const match = url.match(/\/n\/(\d+)\/profile/);
  return match ? match[1] : null;
}

describe("input-resolver URL patterns", () => {
  describe("classifyGbpUrl", () => {
    it("should identify short share URLs", () => {
      expect(classifyGbpUrl("https://maps.app.goo.gl/AbCdEf123")).toBe("short");
    });

    it("should identify full Maps URLs with place data", () => {
      expect(
        classifyGbpUrl(
          "https://www.google.com/maps/place/Dhivya+Dentals/@9.9252,78.1198,17z/data=!3m1!4b1"
        )
      ).toBe("full_maps");
    });

    it("should identify Maps URLs with CID param", () => {
      expect(
        classifyGbpUrl("https://maps.google.com/?cid=1311521834783186927")
      ).toBe("cid_param");
    });

    it("should identify GBP direct URLs", () => {
      expect(
        classifyGbpUrl("https://business.google.com/n/12345678901234567890/profile")
      ).toBe("gbp_direct");
    });

    it("should return null for non-GBP URLs", () => {
      expect(classifyGbpUrl("https://www.google.com/search?q=dentist")).toBeNull();
      expect(classifyGbpUrl("https://facebook.com/page")).toBeNull();
      expect(classifyGbpUrl("not-a-url")).toBeNull();
    });
  });

  describe("extractCidFromUrl", () => {
    it("should extract hex CID from data= parameter", () => {
      const url =
        "https://www.google.com/maps/place/Test/@0,0,17z/data=!3m1!1s0x3b00c5e2abcdef12:0x1234567890abcdef";
      expect(extractCidFromUrl(url)).toBe("3b00c5e2abcdef12");
    });

    it("should extract numeric CID from ?cid= parameter", () => {
      const url = "https://maps.google.com/?cid=1311521834783186927";
      expect(extractCidFromUrl(url)).toBe("1311521834783186927");
    });

    it("should return null when no CID is present", () => {
      expect(extractCidFromUrl("https://maps.app.goo.gl/short")).toBeNull();
    });
  });

  describe("extractLocationIdFromGbp", () => {
    it("should extract the location ID from a GBP direct URL", () => {
      expect(
        extractLocationIdFromGbp("https://business.google.com/n/12345678901234567890/profile")
      ).toBe("12345678901234567890");
    });

    it("should return null for non-GBP URLs", () => {
      expect(extractLocationIdFromGbp("https://google.com/maps")).toBeNull();
    });
  });
});

describe("website URL normalisation", () => {
  function normaliseWebsiteUrl(url: string): string {
    let normalised = url.trim();
    if (!/^https?:\/\//i.test(normalised)) {
      normalised = `https://${normalised}`;
    }
    normalised = normalised.replace(/\/+$/, "");
    return normalised;
  }

  it("should add https:// if missing", () => {
    expect(normaliseWebsiteUrl("dhivyadentals.com")).toBe("https://dhivyadentals.com");
  });

  it("should strip trailing slashes", () => {
    expect(normaliseWebsiteUrl("https://example.com///")).toBe("https://example.com");
  });

  it("should preserve existing https://", () => {
    expect(normaliseWebsiteUrl("https://example.com")).toBe("https://example.com");
  });

  it("should preserve http://", () => {
    expect(normaliseWebsiteUrl("http://example.com")).toBe("http://example.com");
  });

  it("should trim whitespace", () => {
    expect(normaliseWebsiteUrl("  https://example.com  ")).toBe("https://example.com");
  });
});
