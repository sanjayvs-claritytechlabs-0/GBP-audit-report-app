import { describe, it, expect } from "vitest";
import {
  computeProfileCompletenessScore,
  computeReviewScore,
  computeRankScore,
  computeCitationScore,
  computeWebsiteScore,
  computeOverallScore,
} from "@/lib/scorer";
import type { GBPData, ReviewData, RankData, CitationResult, WebsiteAuditResult } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGBP: GBPData = {
  name: "Dhivya Dentals",
  placeId: "ChIJ_test",
  address: "123 Main St, Madurai",
  phone: "+91 98765 43210",
  website: "https://www.dhivyadentals.com",
  categories: ["Dentist", "Dental Clinic", "Cosmetic Dentist", "Orthodontist", "Pediatric Dentist", "Emergency Dental"],
  primaryCategory: "Dentist",
  description: "Trusted dental clinic providing comprehensive oral healthcare services in Madurai.",
  hours: {
    monday: { open: "09:00", close: "18:00" },
    tuesday: { open: "09:00", close: "18:00" },
    wednesday: { open: "09:00", close: "18:00" },
    thursday: { open: "09:00", close: "18:00" },
    friday: { open: "09:00", close: "18:00" },
    saturday: { open: "09:00", close: "14:00" },
    sunday: { open: "00:00", close: "00:00", isClosed: true },
  },
  attributes: {},
  photoCount: 15,
  totalReviews: 156,
  averageRating: 4.6,
  isVerified: true,
  hasBookingLink: true,
  hasMenuLink: false,
  hasMerchantLink: false,
  hasProducts: false,
  hasServices: true,
  serviceArea: ["Madurai"],
  keywords: ["dental clinic", "dentist"],
};

const mockReviews: ReviewData = {
  totalCount: 156,
  averageRating: 4.6,
  ratingDistribution: { 1: 3, 2: 5, 3: 12, 4: 38, 5: 98 },
  recentReviews: [],
  velocityPerWeek: 1.8,
  responseRate: 0.72,
  averageResponseTimeHours: 18,
  flaggedReviews: 0,
  sentimentBreakdown: { positive: 85, neutral: 10, negative: 5 },
};

const mockRankings: RankData = {
  keywords: ["dental clinic", "dentist near me", "teeth whitening"],
  gridPoints: [],
  keywordResults: [
    { keyword: "dental clinic", gridRanks: [], avgRank: 4.2, rank1Count: 8, top3Count: 22, top10Count: 41, rankScore: 84 },
    { keyword: "dentist near me", gridRanks: [], avgRank: 6.1, rank1Count: 3, top3Count: 14, top10Count: 35, rankScore: 75 },
    { keyword: "teeth whitening", gridRanks: [], avgRank: 8.5, rank1Count: 1, top3Count: 8, top10Count: 28, rankScore: 63 },
  ],
  overallRankScore: 74,
  avgRankByKeyword: {},
  heatmapData: [],
  totalSerpCalls: 147,
  gridSize: 7,
  gridSpacingKm: 1.0,
  centerLat: 9.9252,
  centerLng: 78.1198,
};

const mockCitations: CitationResult = {
  totalChecked: 12,
  found: 7,
  notFound: 5,
  platforms: [],
  napConsistency: {
    nameMatch: 0.86,
    phoneMatch: 0.71,
    addressMatch: 0.71,
    websiteMatch: 0.57,
    overall: 0.72,
  },
  score: 45,
  market: "in",
};

const mockWebsite: WebsiteAuditResult = {
  url: "https://www.dhivyadentals.com",
  finalUrl: "https://www.dhivyadentals.com",
  isHttps: true,
  hasWwwRedirect: true,
  performance: {
    mobile: { score: 62, lcp: 3200, fid: 180, cls: 0.12, fcp: 1800, ttfb: 650, tti: 4200, tbt: 350, speedIndex: 3800 },
    desktop: { score: 85, lcp: 1800, fid: 80, cls: 0.05, fcp: 900, ttfb: 320, tti: 2100, tbt: 120, speedIndex: 1900 },
  },
  onPage: {
    title: "Dhivya Dentals - Best Dental Clinic in Madurai",
    titleLength: 45,
    hasKeywordInTitle: true,
    metaDescription: "Visit Dhivya Dentals for comprehensive dental care in Madurai.",
    metaDescriptionLength: 62,
    h1Count: 1,
    h1Text: ["Welcome to Dhivya Dentals"],
    h2Count: 5,
    h2Text: [],
    imageCount: 15,
    imagesWithAlt: 10,
    imagesWithoutAlt: 5,
    internalLinks: 12,
    externalLinks: 3,
    wordCount: 1200,
    hasCanonical: true,
    canonicalUrl: "https://www.dhivyadentals.com",
    hasRobotsMeta: true,
    robotsContent: "index, follow",
    hasOpenGraph: true,
    hasTwitterCard: false,
    hasViewport: true,
    hasCharset: true,
    langAttribute: "en",
  },
  nap: { nameOnSite: "Dhivya Dentals", addressOnSite: "123 Main St", phoneOnSite: "+91 98765 43210", nameMatch: true, addressMatch: true, phoneMatch: true, napScore: 20 },
  technical: {
    isHttps: true,
    hasWwwRedirect: true,
    hasHttpToHttpsRedirect: true,
    hasSitemap: true,
    hasRobotsTxt: true,
    hasMobileFriendly: true,
    hasAmpVersion: false,
    responseTime: 450,
    statusCode: 200,
    hasGzip: true,
    hasBrotli: false,
  },
  schema: {
    hasSchema: true,
    types: ["LocalBusiness", "Dentist"],
    hasLocalBusiness: true,
    hasOrganization: false,
    hasProduct: false,
    hasReview: false,
    hasBreadcrumb: false,
    hasFAQ: false,
    markupMethod: "json-ld",
  },
  backlinks: { domainAuthority: 28, pageAuthority: 32, linkingDomains: 45, totalLinks: 120, spamScore: 3 },
  score: 69,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scorer", () => {
  describe("computeProfileCompletenessScore", () => {
    it("should return a score between 0 and 100", () => {
      const { score } = computeProfileCompletenessScore(mockGBP);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should give points for present fields", () => {
      const { detail } = computeProfileCompletenessScore(mockGBP);
      expect(detail.fieldsPresent).toContain("name");
      expect(detail.fieldsPresent).toContain("primaryCategory");
      expect(detail.fieldsPresent).toContain("website");
      expect(detail.fieldsPresent).toContain("phone");
    });

    it("should identify missing fields", () => {
      const { detail } = computeProfileCompletenessScore(mockGBP);
      expect(detail.fieldsMissing).toContain("products");
    });
  });

  describe("computeReviewScore", () => {
    it("should return a score between 0 and 100", () => {
      const { score } = computeReviewScore(mockReviews);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should compute rating component correctly", () => {
      const { detail } = computeReviewScore(mockReviews);
      // (4.6 / 5) * 25 = 23.0
      expect(detail.ratingComponent).toBeCloseTo(23, 0);
    });

    it("should compute velocity component correctly", () => {
      const { detail } = computeReviewScore(mockReviews);
      // min(25, (1.8 / 2) * 25) = 22.5
      expect(detail.velocityComponent).toBeCloseTo(22.5, 0);
    });

    it("should give full flag component when no flags", () => {
      const { detail } = computeReviewScore(mockReviews);
      expect(detail.flagComponent).toBe(10);
    });

    it("should deduct for flagged reviews", () => {
      const flagged = { ...mockReviews, flaggedReviews: 3 };
      const { detail } = computeReviewScore(flagged);
      // max(0, 10 - 3 * 2) = 4
      expect(detail.flagComponent).toBe(4);
    });
  });

  describe("computeRankScore", () => {
    it("should return a score between 0 and 100", () => {
      const { score } = computeRankScore(mockRankings);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should compute keyword_score = max(0, 100 - (avgRank-1)*5)", () => {
      const { detail } = computeRankScore(mockRankings);
      // dental clinic: max(0, 100 - (4.2 - 1) * 5) = max(0, 100 - 16) = 84
      expect(detail.keywordScores["dental clinic"]).toBe(84);
    });

    it("should average keyword scores for overall", () => {
      const { detail } = computeRankScore(mockRankings);
      const avg = (84 + 74.5 + 62.5) / 3;
      expect(detail.overall).toBeCloseTo(avg, 0);
    });
  });

  describe("computeCitationScore", () => {
    it("should return a score between 0 and 100", () => {
      const { score } = computeCitationScore(mockCitations);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should compute presence component correctly", () => {
      const { detail } = computeCitationScore(mockCitations);
      // (7 / 12) * 50 = 29.17
      expect(detail.presenceComponent).toBeCloseTo(29.17, 1);
    });

    it("should compute phone accuracy component", () => {
      const { detail } = computeCitationScore(mockCitations);
      // 0.71 * 20 = 14.2
      expect(detail.phoneComponent).toBeCloseTo(14.2, 0);
    });
  });

  describe("computeWebsiteScore", () => {
    it("should return a score between 0 and 100", () => {
      const { score } = computeWebsiteScore(mockWebsite);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should compute performance component from mobile PSI", () => {
      const { detail } = computeWebsiteScore(mockWebsite);
      // (62 / 100) * 25 = 15.5
      expect(detail.performanceComponent).toBeCloseTo(15.5, 0);
    });

    it("should give full NAP score when all match", () => {
      const { detail } = computeWebsiteScore(mockWebsite);
      expect(detail.napComponent).toBe(20);
    });

    it("should give backlink points based on DA thresholds", () => {
      const { detail } = computeWebsiteScore(mockWebsite);
      // DA 28 → 3 pts; spam 3 < 5 → 4 pts; total = 7
      expect(detail.backlinksComponent).toBe(7);
    });
  });

  describe("computeOverallScore", () => {
    it("should compute weighted average correctly", () => {
      const overall = computeOverallScore({
        rank: 70,
        citations: 45,
        profileCompleteness: 72,
        profileSeo: 58,
        website: 69,
        reviews: 81,
      });
      // 70*0.25 + 45*0.20 + 72*0.15 + 58*0.15 + 69*0.15 + 81*0.10
      // = 17.5 + 9 + 10.8 + 8.7 + 10.35 + 8.1 = 64.45
      expect(overall).toBeCloseTo(64.45, 1);
    });

    it("should return 100 when all sub-scores are 100", () => {
      const overall = computeOverallScore({
        rank: 100, citations: 100, profileCompleteness: 100,
        profileSeo: 100, website: 100, reviews: 100,
      });
      expect(overall).toBe(100);
    });

    it("should return 0 when all sub-scores are 0", () => {
      const overall = computeOverallScore({
        rank: 0, citations: 0, profileCompleteness: 0,
        profileSeo: 0, website: 0, reviews: 0,
      });
      expect(overall).toBe(0);
    });
  });
});
