/**
 * rank-engine.ts
 *
 * Builds a 7x7 geo-grid centred on the business location,
 * fires Serper Maps API calls for each keyword+grid-point combination,
 * and computes rank scores.
 *
 * 7x7 grid = 49 points × 5 keywords = 245 Serper API calls per audit.
 * Batched at 10 concurrent using p-limit.
 * Grid points reverse-geocoded and cached 7 days in Redis.
 */

import axios from "axios";
import pLimit from "p-limit";
import type {
  RankEngineParams,
  RankData,
  GridPoint,
  KeywordRankResult,
  HeatmapCell,
  SerpResult,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const DEFAULT_GRID_SIZE = 7;
const DEFAULT_GRID_SPACING_KM = 0.5;
const SERPER_CONCURRENCY = parseInt(process.env.SERPER_CONCURRENCY ?? "10", 10);
const NOT_FOUND_RANK = 21; // Rank assigned when business not in top 20

// ---------------------------------------------------------------------------
// Grid Building
// ---------------------------------------------------------------------------

/**
 * Convert km offset to latitude degrees.
 */
function kmToLatDeg(km: number): number {
  return km / 111.32;
}

/**
 * Convert km offset to longitude degrees at a given latitude.
 */
function kmToLngDeg(km: number, lat: number): number {
  return km / (111.32 * Math.cos((lat * Math.PI) / 180));
}

/**
 * Build a gridSize x gridSize grid of lat/lng points centred on (centerLat, centerLng).
 * Points are spaced spacingKm apart.
 */
export function buildGrid(
  centerLat: number,
  centerLng: number,
  gridSize: number,
  spacingKm: number
): GridPoint[] {
  const points: GridPoint[] = [];
  const half = Math.floor(gridSize / 2);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const rowOffset = (row - half) * spacingKm;
      const colOffset = (col - half) * spacingKm;

      const lat = centerLat + kmToLatDeg(rowOffset);
      const lng = centerLng + kmToLngDeg(colOffset, centerLat);

      points.push({
        index: row * gridSize + col,
        row,
        col,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        address: "", // Filled by reverse geocoding
      });
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Reverse Geocoding (with Redis cache)
// ---------------------------------------------------------------------------

let redisClient: import("ioredis").Redis | null = null;

async function getRedisClient(): Promise<import("ioredis").Redis | null> {
  if (!process.env.REDIS_URL) return null;
  if (redisClient) return redisClient;
  try {
    const { Redis } = await import("ioredis");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    return redisClient;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `geocode:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const redis = await getRedisClient();

  // Check cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached;
    } catch {
      // Cache miss — continue
    }
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: { latlng: `${lat},${lng}`, key: apiKey },
        timeout: 5000,
      }
    );

    const result = response.data?.results?.[0];
    const address = result?.formatted_address ?? `${lat}, ${lng}`;

    // Cache for 7 days
    if (redis) {
      try {
        await redis.setex(cacheKey, 7 * 24 * 3600, address);
      } catch {
        // Non-fatal
      }
    }

    return address;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// ---------------------------------------------------------------------------
// Serper Maps API
// ---------------------------------------------------------------------------

interface SerperMapResult {
  title: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  type?: string;
  types?: string[];
  cid?: string;
  placeId?: string;
  position?: number;
}

interface SerperMapsResponse {
  places?: SerperMapResult[];
}

async function searchSerperMaps(
  keyword: string,
  lat: number,
  lng: number,
  market: string = "in"
): Promise<SerperMapResult[]> {
  const apiKey = process.env.SERPER_API_KEY ?? "";
  if (!apiKey) return [];

  try {
    const response = await axios.post<SerperMapsResponse>(
      "https://google.serper.dev/maps",
      {
        q: keyword,
        location: `${lat},${lng}`,
        gl: market,
        hl: "en",
        num: 20,
      },
      {
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );
    return response.data?.places ?? [];
  } catch {
    return [];
  }
}

/**
 * Find the rank of the target business in a list of SERP results.
 * Returns 1-indexed position, or NOT_FOUND_RANK if not found.
 */
function findBusinessRank(
  results: SerperMapResult[],
  businessName: string
): number {
  const nameLower = businessName.toLowerCase().trim();

  for (let i = 0; i < results.length; i++) {
    const title = (results[i].title ?? "").toLowerCase().trim();

    // Exact match
    if (title === nameLower) return i + 1;

    // Partial match (business name is contained in result title or vice versa)
    if (title.includes(nameLower) || nameLower.includes(title)) {
      return i + 1;
    }

    // Token overlap match (>60% shared words)
    const targetTokens = new Set(nameLower.split(/\s+/));
    const resultTokens = title.split(/\s+/);
    const overlap = resultTokens.filter((t) => targetTokens.has(t)).length;
    if (overlap / Math.max(targetTokens.size, resultTokens.length) > 0.6) {
      return i + 1;
    }
  }

  return NOT_FOUND_RANK;
}

// ---------------------------------------------------------------------------
// Rank Score Computation
// ---------------------------------------------------------------------------

export function computeKeywordRankScore(avgRank: number): number {
  return Math.max(0, 100 - (avgRank - 1) * 5);
}

// ---------------------------------------------------------------------------
// Heatmap Color
// ---------------------------------------------------------------------------

function rankToColor(avgRank: number): string {
  if (avgRank <= 3) return "#16a34a";  // Green
  if (avgRank <= 7) return "#65a30d";  // Light green
  if (avgRank <= 10) return "#f59e0b"; // Amber
  if (avgRank <= 15) return "#f97316"; // Orange
  return "#dc2626";                    // Red
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run geo-grid rank checks for a business.
 * Fires gridSize² × keywords.length Serper Maps API calls.
 */
export async function runRankChecks(
  params: RankEngineParams,
  market: string = "in"
): Promise<RankData> {
  if (!process.env.SERPER_API_KEY) {
    throw new Error(
      "SERPER_API_KEY is not configured. Copy .env.local.template to .env.local and add your Serper API key. Get one at https://serper.dev."
    );
  }

  const gridSize = params.gridSize ?? DEFAULT_GRID_SIZE;
  const spacingKm = params.gridSpacingKm ?? DEFAULT_GRID_SPACING_KM;
  const keywords = params.keywords.slice(0, 5);
  const limit = pLimit(SERPER_CONCURRENCY);

  // Step 1: Build grid
  const gridPoints = buildGrid(params.lat, params.lng, gridSize, spacingKm);

  // Step 2: Reverse geocode grid points (batched)
  const geocodeLimit = pLimit(5);
  const geocodedPoints = await Promise.all(
    gridPoints.map((p) =>
      geocodeLimit(async () => ({
        ...p,
        address: await reverseGeocode(p.lat, p.lng),
      }))
    )
  );

  // Step 3: Fire SERP calls for each keyword × grid point
  const keywordResults: KeywordRankResult[] = [];

  for (const keyword of keywords) {
    const serpCallTasks = geocodedPoints.map((point) =>
      limit(async () => {
        const results = await searchSerperMaps(keyword, point.lat, point.lng, market);
        const rank = findBusinessRank(results, params.businessName);
        const serpResults: SerpResult[] = results.map((r, i) => ({
          position: i + 1,
          title: r.title,
          address: r.address,
          rating: r.rating,
          reviewCount: r.ratingCount,
          cid: r.cid,
          placeId: r.placeId,
        }));
        return { rank, serpResults };
      })
    );

    const pointResults = await Promise.all(serpCallTasks);
    const gridRanks = pointResults.map((r) => r.rank);

    const avgRank =
      gridRanks.reduce((sum, r) => sum + r, 0) / gridRanks.length;

    keywordResults.push({
      keyword,
      gridRanks,
      avgRank: Math.round(avgRank * 10) / 10,
      rank1Count: gridRanks.filter((r) => r === 1).length,
      top3Count: gridRanks.filter((r) => r <= 3).length,
      top10Count: gridRanks.filter((r) => r <= 10).length,
      rankScore: computeKeywordRankScore(avgRank),
      serpResults: pointResults.map((r) => r.serpResults),
    });
  }

  // Step 4: Build heatmap
  const heatmapData: HeatmapCell[] = geocodedPoints.map((p) => {
    const ranks = keywordResults.map((kr) => kr.gridRanks[p.index]);
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    return {
      row: p.row,
      col: p.col,
      avgRank: Math.round(avg * 10) / 10,
      color: rankToColor(avg),
    };
  });

  // Step 5: Compute aggregate scores
  const avgRankByKeyword: Record<string, number> = {};
  for (const kr of keywordResults) {
    avgRankByKeyword[kr.keyword] = kr.avgRank;
  }

  const overallRankScore =
    keywordResults.reduce((sum, kr) => sum + kr.rankScore, 0) / keywordResults.length;

  return {
    keywords,
    gridPoints: geocodedPoints,
    keywordResults,
    overallRankScore: Math.round(overallRankScore * 10) / 10,
    avgRankByKeyword,
    heatmapData,
    totalSerpCalls: geocodedPoints.length * keywords.length,
    gridSize,
    gridSpacingKm: spacingKm,
    centerLat: params.lat,
    centerLng: params.lng,
  };
}
