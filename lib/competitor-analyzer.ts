/**
 * competitor-analyzer.ts
 *
 * Extracts and deduplicates the top 5 competitors from rank-engine SERP results.
 * Fetches additional Places data for each competitor.
 */

import axios from "axios";
import type { RankData, SerpResult, CompetitorData } from "@/types";

// ---------------------------------------------------------------------------
// Competitor Extraction
// ---------------------------------------------------------------------------

interface RawCompetitor {
  name: string;
  placeId?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  appearances: number;
  positions: number[];
}

/**
 * Extract unique competitors from SERP results across all keywords and grid points.
 * Competitors are ranked by frequency of appearance in top 3.
 */
export function extractCompetitors(
  rankings: RankData,
  businessName: string
): RawCompetitor[] {
  const competitorMap = new Map<string, RawCompetitor>();
  const normalizedBizName = businessName.toLowerCase().trim();

  for (const keywordResult of rankings.keywordResults) {
    if (!keywordResult.serpResults) continue;

    for (const gridResults of keywordResult.serpResults) {
      for (const result of gridResults) {
        const name = result.title.trim();
        const normalizedName = name.toLowerCase();

        // Skip the target business itself
        if (
          normalizedName.includes(normalizedBizName) ||
          normalizedBizName.includes(normalizedName)
        ) {
          continue;
        }

        const key = result.placeId || normalizedName;
        const existing = competitorMap.get(key);

        if (existing) {
          existing.appearances++;
          existing.positions.push(result.position);
          if (result.rating && (!existing.rating || result.rating > existing.rating)) {
            existing.rating = result.rating;
          }
          if (result.reviewCount && (!existing.reviewCount || result.reviewCount > existing.reviewCount)) {
            existing.reviewCount = result.reviewCount;
          }
        } else {
          competitorMap.set(key, {
            name,
            placeId: result.placeId,
            address: result.address,
            rating: result.rating,
            reviewCount: result.reviewCount,
            categories: result.categories,
            appearances: 1,
            positions: [result.position],
          });
        }
      }
    }
  }

  // Sort by appearances in top 3, then by average position
  return Array.from(competitorMap.values())
    .sort((a, b) => {
      const aTop3 = a.positions.filter((p) => p <= 3).length;
      const bTop3 = b.positions.filter((p) => p <= 3).length;
      if (bTop3 !== aTop3) return bTop3 - aTop3;

      const aAvg = a.positions.reduce((s, p) => s + p, 0) / a.positions.length;
      const bAvg = b.positions.reduce((s, p) => s + p, 0) / b.positions.length;
      return aAvg - bAvg;
    })
    .slice(0, 5);
}

/**
 * Fetch additional Places data for a competitor using Google Places API.
 */
async function fetchPlacesData(
  placeId: string
): Promise<Partial<CompetitorData>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !placeId) return {};

  try {
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "displayName,rating,userRatingCount,websiteUri,nationalPhoneNumber,photos",
        },
        timeout: 5000,
      }
    );

    const data = response.data;
    return {
      rating: data.rating,
      reviewCount: data.userRatingCount,
      websiteUrl: data.websiteUri,
      phone: data.nationalPhoneNumber,
      photoCount: data.photos?.length ?? 0,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze competitors from ranking data.
 * Returns the top 5 competitors with their ranking metrics.
 */
export async function analyzeCompetitors(
  rankings: RankData,
  businessName: string
): Promise<CompetitorData[]> {
  const raw = extractCompetitors(rankings, businessName);
  const totalGridPoints = rankings.gridSize * rankings.gridSize;

  const competitors: CompetitorData[] = await Promise.all(
    raw.map(async (comp, idx) => {
      const avgRank =
        comp.positions.reduce((s, p) => s + p, 0) / comp.positions.length;
      const top3 = comp.positions.filter((p) => p <= 3).length;

      let extra: Partial<CompetitorData> = {};
      if (comp.placeId) {
        extra = await fetchPlacesData(comp.placeId);
      }

      return {
        rank: idx + 1,
        name: comp.name,
        placeId: comp.placeId,
        address: comp.address,
        rating: extra.rating ?? comp.rating,
        reviewCount: extra.reviewCount ?? comp.reviewCount,
        categories: comp.categories,
        avgRankAcrossGrid: Math.round(avgRank * 10) / 10,
        top3Frequency: top3,
        gridAppearances: Math.min(comp.appearances, totalGridPoints),
        websiteUrl: extra.websiteUrl,
        phone: extra.phone,
        photoCount: extra.photoCount,
      };
    })
  );

  return competitors;
}
