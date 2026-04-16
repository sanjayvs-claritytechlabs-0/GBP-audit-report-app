/**
 * gbp-collector.ts
 *
 * Fetches all 25 GBP parameters via Google Places API (New).
 * Falls back to mock data if API key not available.
 */

import axios from "axios";
import type { GBPData, BusinessHours, DayHours } from "@/types";

// ---------------------------------------------------------------------------
// Places API Field Mask
// ---------------------------------------------------------------------------

const GBP_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "primaryType",
  "primaryTypeDisplayName",
  "types",
  "rating",
  "userRatingCount",
  "photos",
  "priceLevel",
  "businessStatus",
  "location",
  "accessibilityOptions",
  "paymentOptions",
].join(",");

// ---------------------------------------------------------------------------
// Type Helpers
// ---------------------------------------------------------------------------

interface PlacesApiPeriod {
  open?: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

interface PlacesApiOpeningHours {
  periods?: PlacesApiPeriod[];
  weekdayDescriptions?: string[];
  openNow?: boolean;
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function parseOpeningHours(hours: PlacesApiOpeningHours): BusinessHours {
  const result: BusinessHours = {};

  if (!hours.periods) return result;

  for (const period of hours.periods) {
    if (!period.open) continue;
    const dayName = DAY_NAMES[period.open.day] as keyof Omit<BusinessHours, "isOpen24Hours">;
    if (!dayName) continue;

    const dayHours: DayHours = {
      open: formatTime(period.open.hour, period.open.minute),
      close: period.close
        ? formatTime(period.close.hour, period.close.minute)
        : "23:59",
    };

    // Detect 24h (open=00:00, no close or close=00:00 next day)
    if (!period.close || (period.close.day !== period.open.day && period.close.hour === 0)) {
      result.isOpen24Hours = true;
    }

    result[dayName] = dayHours;
  }

  return result;
}

function extractKeywords(name: string, description: string, categories: string[]): string[] {
  const text = `${name} ${description} ${categories.join(" ")}`.toLowerCase();
  const words = text.match(/\b[a-z]{3,}\b/g) ?? [];
  const stopWords = new Set([
    "and", "the", "for", "with", "from", "that", "this", "are", "was",
    "our", "your", "all", "has", "have", "will", "more", "been",
  ]);
  const unique = Array.from(new Set(words.filter((w) => !stopWords.has(w))));
  return unique.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Fetch all GBP parameters from Google Places API (New).
 */
export async function collectGBPData(placeId: string, _businessName?: string): Promise<GBPData> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";

  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not configured. Copy .env.local.template to .env.local and add your Google Places API key. See https://console.cloud.google.com → APIs & Services → Credentials."
    );
  }

  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": GBP_FIELD_MASK,
        },
        timeout: 15000,
      }
    );

    const place = response.data;

    const name: string = place.displayName?.text ?? "";
    const primaryCategory: string = place.primaryTypeDisplayName?.text ?? place.primaryType ?? "";
    const categories: string[] = [
      primaryCategory,
      ...(place.types ?? []).map((t: string) =>
        t.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      ),
    ].filter((c, i, arr) => c && arr.indexOf(c) === i);

    const description: string =
      place.editorialSummary?.text ?? place.generativeSummary?.overview?.text ?? "";

    // Build attributes object
    const attributes: Record<string, string | boolean> = {};
    const boolFields = [
      "takeout", "delivery", "dineIn", "reservable", "curbsidePickup",
      "goodForChildren", "goodForGroups", "outdoorSeating", "liveMusic",
      "allowsDogs", "servesBeer", "servesWine", "servesBreakfast",
      "servesLunch", "servesDinner", "servesBrunch", "servesCocktails",
      "servesCoffee", "servesDessert", "servesVegetarianFood",
    ];
    for (const field of boolFields) {
      if (place[field] !== undefined) {
        attributes[field] = Boolean(place[field]);
      }
    }

    // Payment options
    const paymentMethods: string[] = [];
    if (place.paymentOptions?.acceptsCreditCards) paymentMethods.push("Credit Card");
    if (place.paymentOptions?.acceptsDebitCards) paymentMethods.push("Debit Card");
    if (place.paymentOptions?.acceptsCashOnly) paymentMethods.push("Cash Only");
    if (place.paymentOptions?.acceptsNfc) paymentMethods.push("NFC/Contactless");

    // Accessibility
    const accessibility: string[] = [];
    if (place.accessibilityOptions?.wheelchairAccessibleEntrance)
      accessibility.push("Wheelchair accessible entrance");
    if (place.accessibilityOptions?.wheelchairAccessibleParking)
      accessibility.push("Wheelchair accessible parking");
    if (place.accessibilityOptions?.wheelchairAccessibleRestroom)
      accessibility.push("Wheelchair accessible restroom");
    if (place.accessibilityOptions?.wheelchairAccessibleSeating)
      accessibility.push("Wheelchair accessible seating");

    const hours = place.regularOpeningHours
      ? parseOpeningHours(place.regularOpeningHours)
      : {};

    const gbpData: GBPData = {
      name,
      placeId,
      address: place.formattedAddress ?? "",
      phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? "",
      website: place.websiteUri ?? "",
      categories,
      primaryCategory,
      description,
      hours,
      attributes,
      photoCount: Array.isArray(place.photos) ? place.photos.length : 0,
      totalReviews: place.userRatingCount ?? 0,
      averageRating: place.rating ?? 0,
      isVerified: true, // Assume verified if retrievable via API
      hasBookingLink: Boolean(place.reservable),
      hasMenuLink: Boolean(place.menuForChildren !== undefined || place.servesDinner),
      hasMerchantLink: false,
      hasProducts: false,
      hasServices: true,
      keywords: extractKeywords(name, description, categories),
      priceLevel: place.priceLevel
        ? (["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE",
            "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel) as 1 | 2 | 3 | 4) || 1
        : undefined,
      accessibility: accessibility.length > 0 ? accessibility : undefined,
      paymentMethods: paymentMethods.length > 0 ? paymentMethods : undefined,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
    };

    return gbpData;
  } catch (error) {
    const message =
      axios.isAxiosError(error)
        ? `${error.message}${error.response?.data ? ` — ${JSON.stringify(error.response.data)}` : ""}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    throw new Error(
      `Failed to fetch GBP data from Google Places API for placeId "${placeId}": ${message}`
    );
  }
}
