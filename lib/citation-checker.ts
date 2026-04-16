/**
 * citation-checker.ts
 *
 * Verifies business presence and NAP consistency across 11 listing platforms
 * focused on US Healthcare & Wellness businesses.
 *
 * Platforms checked:
 *  1. Google Business Profile  — implicitly verified (input to audit)
 *  2. Healthgrades             — via Serper site: search
 *  3. Yelp                     — via Yelp Fusion API
 *  4. Zocdoc                   — via Serper site: search
 *  5. WebMD                    — via Serper site: search
 *  6. Vitals                   — via Serper site: search
 *  7. CareDash                 — via Serper site: search
 *  8. RateMDs                  — via Serper site: search
 *  9. Apple Maps               — via Apple Maps Links search
 * 10. Meta (Facebook)          — via Facebook Graph API
 * 11. Advice Local             — via Advice Local Partner API
 */

import axios from "axios";
import type {
  NAPData,
  CitationPlatform,
  CitationResult,
  NAPConsistency,
  CitationMarket,
} from "@/types";
import { persistTestingJson } from "@/lib/testing-data";

// ---------------------------------------------------------------------------
// NAP Normalisation Helpers
// ---------------------------------------------------------------------------

/** Normalise a business name for comparison. */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-()'"!@#$%^&*]/g, "")
    .replace(/\b(pvt|ltd|llp|inc|llc|corp|co|limited|private|pllc|pc|md|dds|dmd|do|dpm)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise a phone number — strip to last 10 digits. */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Normalise an address for comparison. */
function normaliseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|ste|suite|fl|floor)\b/gi, (match) => {
      const map: Record<string, string> = {
        st: "street", rd: "road", ave: "avenue",
        blvd: "boulevard", dr: "drive", ln: "lane",
        ct: "court", pl: "place", ste: "suite", fl: "floor",
      };
      return map[match.toLowerCase()] || match.toLowerCase();
    })
    .replace(/[.,#\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise a website URL for comparison. */
function normaliseWebsite(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** Compare two NAP fields with normalisation. */
function compareField(
  canonical: string | undefined,
  found: string | undefined,
  normaliser: (s: string) => string
): boolean | null {
  if (!canonical || !found) return null;
  return normaliser(canonical) === normaliser(found);
}

// ---------------------------------------------------------------------------
// Check Result Interface
// ---------------------------------------------------------------------------

interface CheckResult {
  found: boolean;
  listingUrl?: string;
  napData?: Partial<NAPData>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Platform 1: Google Business Profile (always present — it's an audit input)
// ---------------------------------------------------------------------------

async function checkGBP(
  _name: string,
  canonicalNAP: NAPData
): Promise<CheckResult> {
  // GBP is always "found" because it's the starting point of the audit.
  // The NAP data comes from the GBP collector.
  return {
    found: true,
    napData: {
      name: canonicalNAP.name,
      phone: canonicalNAP.phone,
      address: canonicalNAP.address,
      website: canonicalNAP.website,
    },
  };
}

// ---------------------------------------------------------------------------
// Platform 3: Yelp (Yelp Fusion API — real API)
// ---------------------------------------------------------------------------

async function checkYelp(
  name: string,
  city: string,
  state: string,
  lat: number,
  lng: number,
  debug?: { uuid: string }
): Promise<CheckResult> {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) return { found: false, error: "YELP_API_KEY not configured" };

  try {
    const response = await axios.get(
      "https://api.yelp.com/v3/businesses/search",
      {
        params: {
          term: name,
          location: `${city}, ${state}`,
          latitude: lat,
          longitude: lng,
          categories: "health,medcenters,dentists,doctors,chiropractors,acupuncture,massage,optometrists,physicaltherapy",
          limit: 5,
        },
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 8000,
      }
    );
    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "yelp",
        name: "businesses-search-raw",
        data: { endpoint: "api.yelp.com/v3/businesses/search", params: { term: name, location: `${city}, ${state}`, latitude: lat, longitude: lng, limit: 5 }, response: response.data },
      });
    }

    const businesses = response.data?.businesses;
    if (!businesses || businesses.length === 0) return { found: false };

    // Find best name match
    const normalised = normaliseName(name);
    const match = businesses.find(
      (b: Record<string, unknown>) => normaliseName(b.name as string) === normalised
    ) || businesses[0];

    return {
      found: true,
      listingUrl: match.url,
      napData: {
        name: match.name,
        phone: match.phone,
        address: match.location?.display_address?.join(", "),
      },
    };
  } catch {
    return { found: false, error: "Yelp API call failed" };
  }
}

// ---------------------------------------------------------------------------
// Platform 10: Meta / Facebook (Graph API — real API)
// ---------------------------------------------------------------------------

async function checkFacebook(
  name: string,
  lat: number,
  lng: number,
  debug?: { uuid: string }
): Promise<CheckResult> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) return { found: false, error: "FACEBOOK_ACCESS_TOKEN not configured" };

  try {
    const response = await axios.get(
      "https://graph.facebook.com/v19.0/search",
      {
        params: {
          type: "place",
          q: name,
          center: `${lat},${lng}`,
          distance: 500,
          fields: "name,phone,location,website,hours",
          access_token: token,
        },
        timeout: 8000,
      }
    );
    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "facebook",
        name: "places-search-raw",
        data: { endpoint: "graph.facebook.com/v19.0/search", params: { type: "place", q: name, center: `${lat},${lng}`, distance: 500, fields: "name,phone,location,website,hours" }, response: response.data },
      });
    }

    const data = response.data?.data;
    if (!data || data.length === 0) return { found: false };

    const place = data[0];
    return {
      found: true,
      listingUrl: `https://www.facebook.com/${place.id}`,
      napData: {
        name: place.name,
        phone: place.phone,
        address: place.location
          ? `${place.location.street || ""}, ${place.location.city || ""}, ${place.location.state || ""} ${place.location.zip || ""}`.trim()
          : undefined,
        website: place.website,
      },
    };
  } catch {
    return { found: false, error: "Facebook Graph API call failed" };
  }
}

// ---------------------------------------------------------------------------
// Serper Site-Search Based Checkers
// (Used for Healthgrades, Zocdoc, WebMD, Vitals, CareDash, RateMDs)
// ---------------------------------------------------------------------------

/**
 * Uses Serper.dev API to perform a `site:{domain} "{business name}" {city}`
 * search and checks if the business appears in results. Extracts the listing
 * URL and any visible NAP data from the snippet.
 */
async function checkViaSerperSiteSearch(
  domain: string,
  name: string,
  city: string,
  state: string,
  debug?: { uuid: string }
): Promise<CheckResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { found: false, error: "SERPER_API_KEY not configured" };

  try {
    const query = `site:${domain} "${name}" ${city} ${state}`;
    const response = await axios.post(
      "https://google.serper.dev/search",
      { q: query, gl: "us", hl: "en", num: 5 },
      {
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );
    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "serper",
        name: `site-search-${domain}`,
        data: { endpoint: "google.serper.dev/search", request: { q: query, gl: "us", hl: "en", num: 5 }, response: response.data },
      });
    }

    const organic = response.data?.organic;
    if (!organic || organic.length === 0) return { found: false };

    // Find a result that actually points to the target domain
    const match = organic.find(
      (r: Record<string, unknown>) =>
        typeof r.link === "string" && r.link.includes(domain)
    );

    if (!match) return { found: false };

    // Try to extract NAP from the snippet
    const napData = extractNAPFromSnippet(match.snippet || "", match.title || "");

    return {
      found: true,
      listingUrl: match.link,
      napData: {
        name: napData.name || undefined,
        phone: napData.phone || undefined,
        address: napData.address || undefined,
      },
    };
  } catch {
    return { found: false, error: `Serper site:${domain} search failed` };
  }
}

/**
 * Extract NAP hints from a SERP snippet.
 * Snippets often contain phone numbers and partial addresses.
 */
function extractNAPFromSnippet(
  snippet: string,
  title: string
): { name?: string; phone?: string; address?: string } {
  // Phone: match US formats like (555) 123-4567, 555-123-4567, +1 555 123 4567
  const phoneMatch = snippet.match(
    /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/
  );

  // Address: try to match patterns like "123 Main St, City, ST 12345"
  const addressMatch = snippet.match(
    /\d+\s+[A-Za-z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Suite|Ste)[.,]?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5}/i
  );

  // Name from title — often "Dr. Name - Healthgrades" or "Name, MD - WebMD"
  const nameCleaned = title
    .replace(/[-|–—].*$/, "")
    .replace(/\s*,\s*(MD|DO|DDS|DMD|DPM|DC|OD|PhD|NP|PA|PT|OT|LCSW|RN)\b.*/i, "")
    .trim();

  return {
    name: nameCleaned || undefined,
    phone: phoneMatch
      ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`
      : undefined,
    address: addressMatch ? addressMatch[0].trim() : undefined,
  };
}

// ---------------------------------------------------------------------------
// Platform 9: Apple Maps (MapKit search via apple maps links)
// ---------------------------------------------------------------------------

async function checkAppleMaps(
  name: string,
  lat: number,
  lng: number,
  debug?: { uuid: string }
): Promise<CheckResult> {
  // Apple Maps doesn't have a free search API, so we use Serper to check
  // if the business appears on maps.apple.com or via Apple Business Connect
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { found: false, error: "SERPER_API_KEY not configured" };

  try {
    const query = `site:maps.apple.com "${name}"`;
    const response = await axios.post(
      "https://google.serper.dev/search",
      { q: query, gl: "us", hl: "en", num: 3 },
      {
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );
    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "serper",
        name: "apple-maps-site-search",
        data: { endpoint: "google.serper.dev/search", request: { q: query, gl: "us", hl: "en", num: 3 }, response: response.data },
      });
    }

    const organic = response.data?.organic;
    if (!organic || organic.length === 0) {
      // Fallback: search for business in Apple Maps link format
      const fallbackQuery = `"maps.apple.com" "${name}" near ${lat},${lng}`;
      const fallbackRes = await axios.post(
        "https://google.serper.dev/search",
        { q: fallbackQuery, gl: "us", hl: "en", num: 3 },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 8000,
        }
      );
      if (debug?.uuid) {
        await persistTestingJson({
          uuid: debug.uuid,
          category: "serper",
          name: "apple-maps-fallback-search",
          data: { endpoint: "google.serper.dev/search", request: { q: fallbackQuery, gl: "us", hl: "en", num: 3 }, response: fallbackRes.data },
        });
      }
      const fallbackOrganic = fallbackRes.data?.organic;
      if (!fallbackOrganic || fallbackOrganic.length === 0) return { found: false };

      return {
        found: true,
        listingUrl: fallbackOrganic[0].link,
        napData: { name: fallbackOrganic[0].title?.replace(/ - Apple Maps.*/, "").trim() },
      };
    }

    const match = organic[0];
    return {
      found: true,
      listingUrl: match.link,
      napData: { name: match.title?.replace(/ - Apple Maps.*/, "").trim() },
    };
  } catch {
    return { found: false, error: "Apple Maps check via Serper failed" };
  }
}

// ---------------------------------------------------------------------------
// Platform 11: Advice Local (Aggregator Partner API)
// ---------------------------------------------------------------------------

async function checkAdviceLocal(
  name: string,
  city: string,
  state: string,
  phone: string,
  debug?: { uuid: string }
): Promise<CheckResult> {
  const apiKey = process.env.ADVICE_LOCAL_API_KEY;
  const partnerId = process.env.ADVICE_LOCAL_PARTNER_ID;

  if (!apiKey || !partnerId) {
    // Fallback to Serper site-search on advicelocal.com
    return checkViaSerperSiteSearch("advicelocal.com", name, city, state, debug);
  }

  try {
    // Advice Local Partner API: Search for existing listing
    const response = await axios.get(
      "https://api.advicelocal.com/v1/listings/search",
      {
        params: {
          partner_id: partnerId,
          business_name: name,
          city,
          state,
          phone: normalisePhone(phone),
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );
    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "advice-local",
        name: "listings-search-raw",
        data: { endpoint: "api.advicelocal.com/v1/listings/search", params: { partner_id: partnerId, business_name: name, city, state, phone: normalisePhone(phone) }, response: response.data },
      });
    }

    const listings = response.data?.data?.listings;
    if (!listings || listings.length === 0) return { found: false };

    const listing = listings[0];
    return {
      found: true,
      listingUrl: listing.listing_url,
      napData: {
        name: listing.business_name,
        phone: listing.phone,
        address: [listing.address, listing.city, listing.state, listing.zip]
          .filter(Boolean)
          .join(", "),
        website: listing.website,
      },
    };
  } catch {
    return { found: false, error: "Advice Local API call failed" };
  }
}

// ---------------------------------------------------------------------------
// Platform Registry — US Healthcare & Wellness (11 platforms)
// ---------------------------------------------------------------------------

interface PlatformDef {
  platform: string;
  displayName: string;
  url: string;
  market: CitationMarket;
  checkMethod: "api" | "search" | "manual";
  checker: (ctx: CheckContext) => Promise<CheckResult>;
}

interface CheckContext {
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  phone: string;
  canonicalNAP: NAPData;
  debug?: { uuid: string };
}

const HEALTHCARE_PLATFORMS: PlatformDef[] = [
  // 1. Google Business Profile
  {
    platform: "google_business_profile",
    displayName: "Google Business Profile",
    url: "https://business.google.com",
    market: "us",
    checkMethod: "api",
    checker: (ctx) => checkGBP(ctx.name, ctx.canonicalNAP),
  },
  // 2. Healthgrades
  {
    platform: "healthgrades",
    displayName: "Healthgrades",
    url: "https://www.healthgrades.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("healthgrades.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 3. Yelp
  {
    platform: "yelp",
    displayName: "Yelp",
    url: "https://www.yelp.com",
    market: "us",
    checkMethod: "api",
    checker: (ctx) => checkYelp(ctx.name, ctx.city, ctx.state, ctx.lat, ctx.lng, ctx.debug),
  },
  // 4. Zocdoc
  {
    platform: "zocdoc",
    displayName: "Zocdoc",
    url: "https://www.zocdoc.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("zocdoc.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 5. WebMD
  {
    platform: "webmd",
    displayName: "WebMD",
    url: "https://doctor.webmd.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("doctor.webmd.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 6. Vitals
  {
    platform: "vitals",
    displayName: "Vitals",
    url: "https://www.vitals.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("vitals.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 7. CareDash
  {
    platform: "caredash",
    displayName: "CareDash",
    url: "https://www.caredash.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("caredash.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 8. RateMDs
  {
    platform: "ratemds",
    displayName: "RateMDs",
    url: "https://www.ratemds.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkViaSerperSiteSearch("ratemds.com", ctx.name, ctx.city, ctx.state, ctx.debug),
  },
  // 9. Apple Maps
  {
    platform: "apple_maps",
    displayName: "Apple Maps",
    url: "https://maps.apple.com",
    market: "us",
    checkMethod: "search",
    checker: (ctx) => checkAppleMaps(ctx.name, ctx.lat, ctx.lng, ctx.debug),
  },
  // 10. Meta (Facebook)
  {
    platform: "meta_facebook",
    displayName: "Meta (Facebook)",
    url: "https://www.facebook.com",
    market: "us",
    checkMethod: "api",
    checker: (ctx) => checkFacebook(ctx.name, ctx.lat, ctx.lng, ctx.debug),
  },
  // 11. Advice Local (Aggregator)
  {
    platform: "advice_local",
    displayName: "Advice Local",
    url: "https://www.advicelocal.com",
    market: "us",
    checkMethod: "api",
    checker: (ctx) => checkAdviceLocal(ctx.name, ctx.city, ctx.state, ctx.phone, ctx.debug),
  },
];

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

/**
 * Run citation checks across all 11 US Healthcare & Wellness platforms.
 * Returns presence, NAP accuracy, and per-platform results.
 */
export async function runCitationChecks(params: {
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  market: "in" | "us";
  primaryCategory: string;
  canonicalNAP: NAPData;
  debug?: { uuid: string };
}): Promise<CitationResult> {
  const { name, lat, lng, city, state, canonicalNAP, debug } = params;
  const phone = canonicalNAP.phone || "";

  const ctx: CheckContext = { name, lat, lng, city, state, phone, canonicalNAP, debug };

  // Run all 11 platform checks in parallel
  const results = await Promise.allSettled(
    HEALTHCARE_PLATFORMS.map(async (pDef) => {
      const result = await pDef.checker(ctx);
      const platform: CitationPlatform = {
        platform: pDef.platform,
        displayName: pDef.displayName,
        url: pDef.url,
        found: result.found,
        listingUrl: result.listingUrl,
        napData: result.napData,
        nameMatch: result.found
          ? compareField(canonicalNAP.name, result.napData?.name, normaliseName)
          : null,
        phoneMatch: result.found
          ? compareField(canonicalNAP.phone, result.napData?.phone, normalisePhone)
          : null,
        addressMatch: result.found
          ? compareField(canonicalNAP.address, result.napData?.address, normaliseAddress)
          : null,
        websiteMatch: result.found
          ? compareField(canonicalNAP.website, result.napData?.website, normaliseWebsite)
          : null,
        market: pDef.market,
        checkMethod: pDef.checkMethod,
        error: result.error,
      };
      return platform;
    })
  );

  const platforms = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          platform: "unknown",
          displayName: "Unknown",
          url: "",
          found: false,
          nameMatch: null,
          phoneMatch: null,
          addressMatch: null,
          websiteMatch: null,
          market: "us" as CitationMarket,
          checkMethod: "manual" as const,
          error: r.reason instanceof Error ? r.reason.message : "Check failed",
        }
  );

  const foundPlatforms = platforms.filter((p) => p.found);
  const totalChecked = platforms.length;
  const found = foundPlatforms.length;

  // Compute NAP consistency across found platforms
  const napConsistency = computeNAPConsistency(foundPlatforms);

  // Compute score (same formula as PRD)
  const presenceScore = totalChecked > 0 ? (found / totalChecked) * 50 : 0;
  const napScore =
    napConsistency.phoneMatch * 20 +
    napConsistency.addressMatch * 15 +
    napConsistency.nameMatch * 10 +
    napConsistency.websiteMatch * 5;
  const score = Math.min(100, Math.round((presenceScore + napScore) * 100) / 100);

  return {
    totalChecked,
    found,
    notFound: totalChecked - found,
    platforms,
    napConsistency,
    score,
    market: "us",
  };
}

function computeNAPConsistency(foundPlatforms: CitationPlatform[]): NAPConsistency {
  if (foundPlatforms.length === 0) {
    return { nameMatch: 0, phoneMatch: 0, addressMatch: 0, websiteMatch: 0, overall: 0 };
  }

  const count = foundPlatforms.length;
  const nameMatches = foundPlatforms.filter((p) => p.nameMatch === true).length;
  const phoneMatches = foundPlatforms.filter((p) => p.phoneMatch === true).length;
  const addressMatches = foundPlatforms.filter((p) => p.addressMatch === true).length;
  const websiteMatches = foundPlatforms.filter((p) => p.websiteMatch === true).length;

  const nameMatch = nameMatches / count;
  const phoneMatch = phoneMatches / count;
  const addressMatch = addressMatches / count;
  const websiteMatch = websiteMatches / count;

  // Weighted overall
  const overall = nameMatch * 0.2 + phoneMatch * 0.35 + addressMatch * 0.3 + websiteMatch * 0.15;

  return {
    nameMatch: Math.round(nameMatch * 100) / 100,
    phoneMatch: Math.round(phoneMatch * 100) / 100,
    addressMatch: Math.round(addressMatch * 100) / 100,
    websiteMatch: Math.round(websiteMatch * 100) / 100,
    overall: Math.round(overall * 100) / 100,
  };
}
