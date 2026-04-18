/**
 * input-resolver.ts
 *
 * Validates and resolves audit inputs:
 * - Parses all 4 GBP URL formats to extract place_id or CID
 * - Calls Google Places API to get lat/lng
 * - Normalises website URL
 */

import axios from "axios";
import { z } from "zod";
import type { AuditInput, ResolvedInput } from "@/types";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const AuditInputSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name must be 120 characters or less")
    .trim(),
  gbpUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) =>
        /maps\.app\.goo\.gl/.test(url) ||
        /share\.google\//.test(url) ||
        /g\.co\/kgs/.test(url) ||
        /g\.page\//.test(url) ||
        /google\.[a-z.]+\/maps/.test(url) ||
        /maps\.google\.[a-z.]+/.test(url) ||
        /business\.google\.com/.test(url) ||
        /search\.google\.com\/local/.test(url),
      "Must be a Google Maps or Business Profile URL"
    ),
  websiteUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => url.startsWith("http"),
      "Website URL must start with http or https"
    ),
  market: z.literal("us").default("us"),
});

// ---------------------------------------------------------------------------
// GBP URL Format Parsers
// ---------------------------------------------------------------------------

/**
 * Format 1: Short URL — https://maps.app.goo.gl/AbCdEfGhIj
 * Follow redirects to get the full Maps URL, then parse that.
 */
async function resolveShortUrl(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: 10000,
      validateStatus: (status) => status < 400,
    });
    return response.request?.res?.responseUrl ?? response.config.url ?? url;
  } catch (error) {
    // Try to get redirect URL from error response
    if (axios.isAxiosError(error) && error.response?.headers?.location) {
      return error.response.headers.location;
    }
    throw new Error(`Failed to resolve short URL: ${url}`);
  }
}

/**
 * Format 2: Full Maps URL — https://www.google.com/maps/place/.../@lat,lng,.../data=...0x{hex}...
 * Extracts CID from the data parameter (hex value after 0x) OR place_id from URL
 */
function parseFullMapsUrl(url: string): { cid?: string; lat?: number; lng?: number; query?: string } {
  const parsed = new URL(url);

  // Extract lat/lng from /@lat,lng,zoom
  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const lat = coordMatch ? parseFloat(coordMatch[1]) : undefined;
  const lng = coordMatch ? parseFloat(coordMatch[2]) : undefined;

  // Extract CID from data parameter — the hex value after '0x' in data=
  const dataParam = parsed.pathname + (parsed.search || "");
  const cidHexMatch = dataParam.match(/0x([0-9a-fA-F]+)(?::0x[0-9a-fA-F]+)?/);
  let cid: string | undefined;
  if (cidHexMatch) {
    cid = BigInt("0x" + cidHexMatch[1]).toString(10);
  }

  // Extract business name from URL path for Places search
  const placeMatch = url.match(/\/maps\/place\/([^/@]+)/);
  const query = placeMatch
    ? decodeURIComponent(placeMatch[1]).replace(/\+/g, " ")
    : undefined;

  return { cid, lat, lng, query };
}

/**
 * Format 3: CID param URL — https://maps.google.com/?cid=12345678
 */
function parseCidParamUrl(url: string): { cid: string } | null {
  const parsed = new URL(url);
  const cid = parsed.searchParams.get("cid");
  if (cid) return { cid };
  return null;
}

/**
 * Format 4: GBP Direct URL — https://business.google.com/n/12345/profile
 * These don't expose place_id directly; we use business name + Places text search
 */
function parseGBPDirectUrl(url: string): { gbpId?: string } {
  const match = url.match(/business\.google\.com\/n\/([^/]+)/);
  return { gbpId: match?.[1] };
}

// ---------------------------------------------------------------------------
// Google Places API Helpers
// ---------------------------------------------------------------------------

interface PlacesSearchResult {
  placeId: string;
  lat: number;
  lng: number;
  name: string;
  formattedAddress?: string;
}

/**
 * Search Places by CID (Customer ID) using Places API text search.
 * CID is passed as cid:{number} in the query.
 */
async function getPlacesByCid(
  cid: string,
  apiKey: string
): Promise<PlacesSearchResult | null> {
  try {
    // Use Places API (new) with a text search using the CID
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { textQuery: `cid:${cid}` },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,places.formattedAddress",
        },
        timeout: 10000,
      }
    );

    const places = response.data?.places;
    if (!places || places.length === 0) return null;

    const place = places[0];
    return {
      placeId: place.id,
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      name: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress,
    };
  } catch {
    return null;
  }
}

/**
 * Search Places by business name text search.
 */
async function getPlacesByText(
  query: string,
  apiKey: string
): Promise<PlacesSearchResult | null> {
  try {
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { textQuery: query },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,places.formattedAddress",
        },
        timeout: 10000,
      }
    );

    const places = response.data?.places;
    if (!places || places.length === 0) return null;

    const place = places[0];
    return {
      placeId: place.id,
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      name: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress,
    };
  } catch {
    return null;
  }
}

/**
 * Get Places data by place_id directly.
 */
async function getPlacesById(
  placeId: string,
  apiKey: string
): Promise<PlacesSearchResult | null> {
  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,location,formattedAddress",
        },
        timeout: 10000,
      }
    );

    const place = response.data;
    return {
      placeId: place.id,
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      name: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a website URL:
 * - Ensure https:// prefix
 * - Remove trailing slash
 * - Lowercase scheme and host
 */
export function normaliseWebsiteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Lowercase scheme + host, keep path as-is
    const normalised =
      parsed.protocol.toLowerCase() +
      "//" +
      parsed.host.toLowerCase() +
      parsed.pathname.replace(/\/$/, "") +
      (parsed.search || "") +
      (parsed.hash || "");
    return normalised;
  } catch {
    // If URL is malformed, return as-is
    return url;
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Resolve audit inputs:
 * 1. Validate all inputs via Zod
 * 2. Detect GBP URL format
 * 3. Extract place_id / CID
 * 4. Fetch lat/lng from Google Places API
 * 5. Normalise website URL
 */
export async function resolveInputs(input: AuditInput): Promise<ResolvedInput> {
  // Validate inputs
  const parsed = AuditInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new Error(`Validation failed: ${firstError.message} (field: ${firstError.path.join(".")})`);
  }

  const { businessName, gbpUrl, websiteUrl, market } = parsed.data;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";

  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not configured. Copy .env.local.template to .env.local and add your Google Places API key. See https://console.cloud.google.com → APIs & Services → Credentials."
    );
  }

  let resolvedGbpUrl = gbpUrl;
  let placeId: string | null = null;
  let cid: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  try {
    // --- Format Detection ---

    // Format 1: Short URL (maps.app.goo.gl or share.google or g.co/kgs or g.page)
    if (/maps\.app\.goo\.gl|share\.google|g\.co\/kgs|g\.page\//.test(gbpUrl)) {
      resolvedGbpUrl = await resolveShortUrl(gbpUrl);
      // After resolving, reparse the full URL
    }

    // Format 3: CID param URL
    if (/[?&]cid=\d+/.test(resolvedGbpUrl)) {
      const cidResult = parseCidParamUrl(resolvedGbpUrl);
      if (cidResult) {
        cid = cidResult.cid;
        const placeData = await getPlacesByCid(cid, apiKey);
        if (placeData) {
          placeId = placeData.placeId;
          lat = placeData.lat;
          lng = placeData.lng;
        }
      }
    }

    // Format 2: Full Maps URL (google.com/maps/place/...)
    if (!placeId && /google\.com\/maps/.test(resolvedGbpUrl)) {
      const mapData = parseFullMapsUrl(resolvedGbpUrl);
      lat = lat ?? mapData.lat;
      lng = lng ?? mapData.lng;
      cid = cid ?? mapData.cid;

      if (cid) {
        const placeData = await getPlacesByCid(cid, apiKey);
        if (placeData) {
          placeId = placeData.placeId;
          lat = lat ?? placeData.lat;
          lng = lng ?? placeData.lng;
        }
      }

      // Search by name from URL if CID didn't work
      if (!placeId && mapData.query) {
        const placeData = await getPlacesByText(mapData.query, apiKey);
        if (placeData) {
          placeId = placeData.placeId;
          lat = lat ?? placeData.lat;
          lng = lng ?? placeData.lng;
        }
      }
    }

    // Format 4: GBP Direct URL (business.google.com)
    if (!placeId && /business\.google\.com/.test(resolvedGbpUrl)) {
      // Fall back to searching by business name
      const placeData = await getPlacesByText(businessName, apiKey);
      if (placeData) {
        placeId = placeData.placeId;
        lat = lat ?? placeData.lat;
        lng = lng ?? placeData.lng;
      }
    }

    // Final fallback: search by business name
    if (!placeId) {
      const placeData = await getPlacesByText(businessName, apiKey);
      if (placeData) {
        placeId = placeData.placeId;
        lat = lat ?? placeData.lat;
        lng = lng ?? placeData.lng;
      }
    }

    if (!placeId) {
      throw new Error(
        `Could not find Google place_id for "${businessName}". Please verify the GBP URL.`
      );
    }

    if (lat === undefined || lng === undefined) {
      // Try to get lat/lng from place details
      const placeData = await getPlacesById(placeId, apiKey);
      if (placeData) {
        lat = placeData.lat;
        lng = placeData.lng;
      } else {
        throw new Error("Could not determine business location coordinates.");
      }
    }

    return {
      businessName,
      placeId,
      cid,
      lat,
      lng,
      websiteUrl: normaliseWebsiteUrl(websiteUrl),
      market: market ?? "us",
      resolvedGbpUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to resolve inputs: ${message}`);
  }
}
