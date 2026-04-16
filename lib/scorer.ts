/**
 * scorer.ts
 *
 * Pure scoring functions — no side effects, no API calls.
 * Computes all 6 sub-scores and the weighted overall score.
 */

import type {
  GBPData,
  ReviewData,
  RankData,
  CitationResult,
  WebsiteAuditResult,
  ScoreBreakdown,
  ScoreWeights,
  ProfileCompletenessDetail,
  ReviewScoreDetail,
  RankScoreDetail,
  CitationScoreDetail,
  WebsiteScoreDetail,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHTS: ScoreWeights = {
  rank: 0.25,
  citations: 0.20,
  profileCompleteness: 0.15,
  profileSeo: 0.15,
  website: 0.15,
  reviews: 0.10,
};

/** GBP field weights for profile completeness — total = 100 */
const PROFILE_FIELD_WEIGHTS: Record<string, { weight: number; check: (gbp: GBPData) => boolean }> = {
  primaryCategory:      { weight: 10, check: (g) => !!g.primaryCategory },
  additionalCategories: { weight: 10, check: (g) => g.categories.length >= 6 },
  description:          { weight: 10, check: (g) => !!g.description && g.description.length >= 20 },
  name:                 { weight: 8,  check: (g) => !!g.name },
  services:             { weight: 8,  check: (g) => g.hasServices },
  exteriorPhotos:       { weight: 6,  check: (g) => g.photoCount >= 5 },
  interiorPhotos:       { weight: 6,  check: (g) => g.photoCount >= 10 },
  staffPhotos:          { weight: 4,  check: (g) => g.photoCount >= 13 },
  website:              { weight: 6,  check: (g) => !!g.website },
  phone:                { weight: 6,  check: (g) => !!g.phone },
  hours:                { weight: 6,  check: (g) => {
    const h = g.hours;
    return !!(h.monday && h.tuesday && h.wednesday && h.thursday && h.friday && h.saturday && h.sunday);
  }},
  bookingLink:          { weight: 6,  check: (g) => g.hasBookingLink },
  serviceArea:          { weight: 4,  check: (g) => !!g.serviceArea && g.serviceArea.length > 0 },
  posts:                { weight: 4,  check: (_g) => false }, // requires posts data
  qAndA:                { weight: 4,  check: (_g) => false }, // requires Q&A data
  products:             { weight: 2,  check: (g) => g.hasProducts },
};

// ---------------------------------------------------------------------------
// Profile Completeness Score (0-100)
// ---------------------------------------------------------------------------

/** Compute profile completeness from GBP data. */
export function computeProfileCompletenessScore(gbp: GBPData): {
  score: number;
  detail: ProfileCompletenessDetail;
} {
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];
  const fieldScores: Record<string, number> = {};
  let totalPoints = 0;

  for (const [field, config] of Object.entries(PROFILE_FIELD_WEIGHTS)) {
    const passed = config.check(gbp);
    const points = passed ? config.weight : 0;
    fieldScores[field] = points;
    totalPoints += points;

    if (passed) {
      fieldsPresent.push(field);
    } else {
      fieldsMissing.push(field);
    }
  }

  return {
    score: Math.min(100, totalPoints),
    detail: { fieldsPresent, fieldsMissing, fieldScores, totalPoints },
  };
}

// ---------------------------------------------------------------------------
// Profile SEO Score (0-100)
// ---------------------------------------------------------------------------

/**
 * Measures keyword presence in GBP fields.
 * Each keyword found in a field scores points for that field.
 *
 * Business title: 6pts/keyword (max 30)
 * Description: 4pts/keyword (max 20)
 * Services: 3pts/keyword (max 15)
 * Additional categories: 3pts/keyword (max 15)
 * Products: 2pts/keyword (max 10)
 * Posts: 2pts/keyword (max 10)
 */
export function computeProfileSeoScore(
  gbp: GBPData,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0;

  const lower = (s: string) => s.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    const kwLower = lower(kw);
    if (lower(gbp.name).includes(kwLower)) score += 6;
    if (lower(gbp.description || "").includes(kwLower)) score += 4;
    if (gbp.categories.some((c) => lower(c).includes(kwLower))) score += 3;
  }

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Review Score (0-100)
// ---------------------------------------------------------------------------

/** Compute review score from review data. */
export function computeReviewScore(reviews: ReviewData): {
  score: number;
  detail: ReviewScoreDetail;
} {
  // Rating component: (averageRating / 5) * 25
  const ratingComponent = Math.min(25, (reviews.averageRating / 5) * 25);

  // Count component: min(25, (reviewCount / 200) * 25)
  const countComponent = Math.min(25, (reviews.totalCount / 200) * 25);

  // Velocity component: min(25, (velocityPerWeek / 2) * 25)
  const velocityComponent = Math.min(25, (reviews.velocityPerWeek / 2) * 25);

  // Response rate component: responseRate * 15
  const responseComponent = Math.min(15, reviews.responseRate * 15);

  // No flags component: flaggedReviews === 0 ? 10 : max(0, 10 - flaggedReviews * 2)
  const flagComponent =
    reviews.flaggedReviews === 0
      ? 10
      : Math.max(0, 10 - reviews.flaggedReviews * 2);

  const total = Math.min(
    100,
    ratingComponent + countComponent + velocityComponent + responseComponent + flagComponent
  );

  return {
    score: Math.round(total * 100) / 100,
    detail: {
      ratingComponent: Math.round(ratingComponent * 100) / 100,
      countComponent: Math.round(countComponent * 100) / 100,
      velocityComponent: Math.round(velocityComponent * 100) / 100,
      responseComponent: Math.round(responseComponent * 100) / 100,
      flagComponent: Math.round(flagComponent * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Rank Score (0-100)
// ---------------------------------------------------------------------------

/**
 * For each keyword, average rank across grid points.
 * keyword_score = max(0, 100 - ((avgRank - 1) * 5))
 * Overall = average of keyword scores.
 */
export function computeRankScore(rankings: RankData): {
  score: number;
  detail: RankScoreDetail;
} {
  const keywordScores: Record<string, number> = {};
  const avgRanks: Record<string, number> = {};

  for (const kr of rankings.keywordResults) {
    const avgRank = kr.avgRank;
    const keywordScore = Math.max(0, 100 - (avgRank - 1) * 5);
    keywordScores[kr.keyword] = Math.round(keywordScore * 100) / 100;
    avgRanks[kr.keyword] = Math.round(avgRank * 100) / 100;
  }

  const scores = Object.values(keywordScores);
  const overall = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;

  return {
    score: overall,
    detail: { keywordScores, avgRanks, overall },
  };
}

// ---------------------------------------------------------------------------
// Citation & NAP Uniformity Score (0-100)
// ---------------------------------------------------------------------------

/** Compute citation score from citation check results. */
export function computeCitationScore(citations: CitationResult): {
  score: number;
  detail: CitationScoreDetail;
} {
  // Platform presence: (foundCount / totalChecked) * 50
  const presenceComponent = citations.totalChecked > 0
    ? (citations.found / citations.totalChecked) * 50
    : 0;

  // NAP accuracy components
  const phoneComponent = citations.napConsistency.phoneMatch * 20;
  const addressComponent = citations.napConsistency.addressMatch * 15;
  const nameComponent = citations.napConsistency.nameMatch * 10;
  const websiteComponent = citations.napConsistency.websiteMatch * 5;

  const total = Math.min(
    100,
    presenceComponent + phoneComponent + addressComponent + nameComponent + websiteComponent
  );

  return {
    score: Math.round(total * 100) / 100,
    detail: {
      presenceComponent: Math.round(presenceComponent * 100) / 100,
      phoneComponent: Math.round(phoneComponent * 100) / 100,
      addressComponent: Math.round(addressComponent * 100) / 100,
      nameComponent: Math.round(nameComponent * 100) / 100,
      websiteComponent: Math.round(websiteComponent * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Website SEO Score (0-100)
// ---------------------------------------------------------------------------

/** Compute website SEO score from audit results. */
export function computeWebsiteScore(website: WebsiteAuditResult): {
  score: number;
  detail: WebsiteScoreDetail;
} {
  // Performance (25 pts): based on mobile PSI score
  const performanceComponent = (website.performance.mobile.score / 100) * 25;

  // On-Page (25 pts): title(6) + meta(3) + h1(4) + schema(6+3) + internal links(3)
  let onPageComponent = 0;
  if (website.onPage.hasKeywordInTitle) onPageComponent += 6;
  if (website.onPage.h1Count === 1) onPageComponent += 4;
  if (website.onPage.metaDescriptionLength >= 120 && website.onPage.metaDescriptionLength <= 160) {
    onPageComponent += 3;
  }
  if (website.schema.hasLocalBusiness) onPageComponent += 6;
  if (website.schema.hasSchema && website.schema.extractedData) onPageComponent += 3;
  if (website.onPage.internalLinks >= 3) onPageComponent += 3;
  onPageComponent = Math.min(25, onPageComponent);

  // NAP consistency (20 pts)
  const napComponent = website.nap.napScore; // already 0-20

  // Technical (20 pts): HTTPS(6) + mobile(5) + redirect(3) + sitemap(3) + broken(3)
  let technicalComponent = 0;
  if (website.technical.isHttps) technicalComponent += 6;
  if (website.technical.hasMobileFriendly) technicalComponent += 5;
  if (website.technical.hasSitemap) technicalComponent += 3;
  if (website.technical.hasRobotsTxt) technicalComponent += 3;
  if (website.technical.statusCode === 200) technicalComponent += 3;
  technicalComponent = Math.min(20, technicalComponent);

  // Backlinks (10 pts): DA score
  let backlinksComponent = 0;
  if (website.backlinks.domainAuthority >= 40) {
    backlinksComponent = 6;
  } else if (website.backlinks.domainAuthority >= 20) {
    backlinksComponent = 3;
  } else {
    backlinksComponent = 1;
  }
  // Spam score
  if (website.backlinks.spamScore < 5) {
    backlinksComponent += 4;
  } else if (website.backlinks.spamScore <= 30) {
    backlinksComponent += 2;
  }
  backlinksComponent = Math.min(10, backlinksComponent);

  const total = Math.min(
    100,
    performanceComponent + onPageComponent + napComponent + technicalComponent + backlinksComponent
  );

  return {
    score: Math.round(total * 100) / 100,
    detail: {
      performanceComponent: Math.round(performanceComponent * 100) / 100,
      onPageComponent: Math.round(onPageComponent * 100) / 100,
      napComponent: Math.round(napComponent * 100) / 100,
      technicalComponent: Math.round(technicalComponent * 100) / 100,
      backlinksComponent: Math.round(backlinksComponent * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Weighted Overall Score
// ---------------------------------------------------------------------------

/** Compute the weighted overall score from all sub-scores. */
export function computeOverallScore(scores: {
  rank: number;
  citations: number;
  profileCompleteness: number;
  profileSeo: number;
  website: number;
  reviews: number;
}): number {
  const overall =
    scores.rank * WEIGHTS.rank +
    scores.citations * WEIGHTS.citations +
    scores.profileCompleteness * WEIGHTS.profileCompleteness +
    scores.profileSeo * WEIGHTS.profileSeo +
    scores.website * WEIGHTS.website +
    scores.reviews * WEIGHTS.reviews;

  return Math.round(overall * 100) / 100;
}

// ---------------------------------------------------------------------------
// Full Scoring Pipeline
// ---------------------------------------------------------------------------

/** Run the entire scoring pipeline and return a ScoreBreakdown. */
export function computeAllScores(input: {
  gbp: GBPData;
  reviews: ReviewData;
  rankings: RankData;
  citations: CitationResult;
  website: WebsiteAuditResult;
  keywords: string[];
}): ScoreBreakdown {
  const profileResult = computeProfileCompletenessScore(input.gbp);
  const profileSeo = computeProfileSeoScore(input.gbp, input.keywords);
  const reviewResult = computeReviewScore(input.reviews);
  const rankResult = computeRankScore(input.rankings);
  const citationResult = computeCitationScore(input.citations);
  const websiteResult = computeWebsiteScore(input.website);

  const overall = computeOverallScore({
    rank: rankResult.score,
    citations: citationResult.score,
    profileCompleteness: profileResult.score,
    profileSeo,
    website: websiteResult.score,
    reviews: reviewResult.score,
  });

  return {
    profileCompleteness: profileResult.score,
    profileSeo,
    reviews: reviewResult.score,
    citations: citationResult.score,
    rank: rankResult.score,
    website: websiteResult.score,
    overall,
    weights: WEIGHTS,
    componentDetails: {
      profileCompleteness: profileResult.detail,
      reviews: reviewResult.detail,
      rank: rankResult.detail,
      citations: citationResult.detail,
      website: websiteResult.detail,
    },
  };
}
