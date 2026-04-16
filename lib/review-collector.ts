/**
 * review-collector.ts
 *
 * Fetches reviews from Google Places API and computes:
 * - Review velocity (reviews/week over 12 weeks)
 * - Response rate
 * - Sentiment breakdown
 */

import axios from "axios";
import { parseISO, subWeeks } from "date-fns";
import type { ReviewData, Review } from "@/types";

// ---------------------------------------------------------------------------
// Sentiment Analysis (simple keyword-based)
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = new Set([
  "excellent", "amazing", "great", "wonderful", "fantastic", "perfect",
  "best", "outstanding", "superb", "brilliant", "love", "recommend",
  "professional", "friendly", "helpful", "clean", "efficient",
]);

const NEGATIVE_WORDS = new Set([
  "worst", "terrible", "horrible", "awful", "bad", "poor", "disappointed",
  "rude", "slow", "overpriced", "dirty", "unprofessional", "avoid",
  "never", "waste", "problem", "issue", "complaint",
]);

function analyzeSentiment(text: string): "positive" | "neutral" | "negative" {
  if (!text) return "neutral";
  const words = text.toLowerCase().split(/\W+/);
  let posCount = 0;
  let negCount = 0;
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) posCount++;
    if (NEGATIVE_WORDS.has(word)) negCount++;
  }
  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Velocity Computation
// ---------------------------------------------------------------------------

/**
 * Compute weekly review velocity over the past 12 weeks.
 */
function computeVelocity(reviews: Review[]): number {
  const twelveWeeksAgo = subWeeks(new Date(), 12);
  const recentReviews = reviews.filter((r) => {
    try {
      return parseISO(r.publishedAt) >= twelveWeeksAgo;
    } catch {
      return false;
    }
  });
  return recentReviews.length / 12;
}

/**
 * Compute response rate (fraction of reviews that have a reply).
 */
function computeResponseRate(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  const replied = reviews.filter((r) => r.hasReply).length;
  return replied / reviews.length;
}

/**
 * Compute average response time in hours (from review date to reply date).
 */
function computeAvgResponseTime(reviews: Review[]): number {
  const repliedReviews = reviews.filter(
    (r) => r.hasReply && r.replyAt && r.publishedAt
  );
  if (repliedReviews.length === 0) return 0;

  const totalHours = repliedReviews.reduce((sum, r) => {
    try {
      const reviewDate = parseISO(r.publishedAt);
      const replyDate = parseISO(r.replyAt!);
      const hours = (replyDate.getTime() - reviewDate.getTime()) / (1000 * 60 * 60);
      return sum + Math.max(0, hours);
    } catch {
      return sum;
    }
  }, 0);

  return totalHours / repliedReviews.length;
}

// ---------------------------------------------------------------------------
// Parse Places API Reviews
// ---------------------------------------------------------------------------

interface PlacesReview {
  name: string;
  rating: number;
  text?: { text: string; languageCode: string };
  originalText?: { text: string };
  authorAttribution?: { displayName: string; uri: string; photoUri: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  flagged?: boolean;
}

function parseReview(raw: PlacesReview, index: number): Review {
  const text = raw.text?.text ?? raw.originalText?.text ?? "";
  return {
    reviewId: raw.name ?? `review-${index}`,
    rating: raw.rating ?? 0,
    text,
    authorName: raw.authorAttribution?.displayName ?? "Anonymous",
    publishedAt: raw.publishTime ?? new Date().toISOString(),
    hasReply: false, // Places API (New) doesn't return replies in basic tier
    sentiment: analyzeSentiment(text),
  };
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Collect reviews for a business from Google Places API.
 * Computes velocity, response rate, and sentiment breakdown.
 */
export async function collectReviews(placeId: string): Promise<ReviewData> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";

  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not configured. Copy .env.local.template to .env.local and add your Google Places API key."
    );
  }

  try {
    // Fetch place details with reviews
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,rating,userRatingCount,reviews",
        },
        params: {
          // Request up to 5 reviews (Places API New limit per call)
          // Use languageCode for English reviews
          languageCode: "en",
        },
        timeout: 15000,
      }
    );

    const place = response.data;
    const rawReviews: PlacesReview[] = place.reviews ?? [];
    const reviews = rawReviews.map((r, i) => parseReview(r, i));

    const totalCount: number = place.userRatingCount ?? 0;
    const averageRating: number = place.rating ?? 0;

    // Rating distribution (approximated from available reviews; Places API doesn't provide histogram)
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const review of reviews) {
      const rating = Math.round(review.rating) as 1 | 2 | 3 | 4 | 5;
      if (rating >= 1 && rating <= 5) {
        distribution[rating]++;
      }
    }

    const velocity = computeVelocity(reviews);
    const responseRate = computeResponseRate(reviews);
    const avgResponseTime = computeAvgResponseTime(reviews);

    // Sentiment breakdown
    const sentimentBreakdown = reviews.reduce(
      (acc, r) => {
        if (r.sentiment === "positive") acc.positive++;
        else if (r.sentiment === "negative") acc.negative++;
        else acc.neutral++;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 }
    );

    const sortedDates = reviews
      .map((r) => r.publishedAt)
      .sort()
      .filter(Boolean);

    return {
      totalCount,
      averageRating,
      ratingDistribution: distribution,
      recentReviews: reviews,
      velocityPerWeek: velocity,
      responseRate,
      averageResponseTimeHours: avgResponseTime,
      flaggedReviews: 0,
      sentimentBreakdown,
      lastReviewDate: sortedDates[sortedDates.length - 1],
      oldestReviewDate: sortedDates[0],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to fetch reviews from Google Places API for placeId "${placeId}": ${message}`
    );
  }
}
