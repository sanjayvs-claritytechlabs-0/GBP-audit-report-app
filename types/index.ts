// =============================================================================
// Local Business SEO Audit — Shared TypeScript Types
// =============================================================================

// ---------------------------------------------------------------------------
// Input & Resolution
// ---------------------------------------------------------------------------

export interface AuditInput {
  businessName: string;
  gbpUrl: string;
  websiteUrl: string;
  keywords?: string[];
  market?: "in" | "us";
}

export interface ResolvedInput {
  businessName: string;
  placeId: string;
  cid?: string;
  lat: number;
  lng: number;
  websiteUrl: string;
  market: "in" | "us";
  resolvedGbpUrl: string;
}

// ---------------------------------------------------------------------------
// Job & Report Envelope
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "processing" | "complete" | "failed";

export interface AuditJob {
  uuid: string;
  jobId: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  steps: JobStep[];
  input: AuditInput;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface JobStep {
  name: string;
  status: "pending" | "in_progress" | "complete" | "failed";
  durationMs: number | null;
}

export interface AuditReport {
  uuid: string;
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
  input: AuditInput;
  resolved?: ResolvedInput;
  scores: ScoreBreakdown;
  gbp?: GBPData;
  reviews?: ReviewData;
  rankings?: RankData;
  competitors?: CompetitorData[];
  citations?: CitationResult;
  website?: WebsiteAuditResult;
  insights?: InsightResult;
  pdfUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// GBP Data
// ---------------------------------------------------------------------------

export interface BusinessHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
  isOpen24Hours?: boolean;
}

export interface DayHours {
  open: string;  // "09:00"
  close: string; // "18:00"
  isClosed?: boolean;
}

export interface GBPData {
  name: string;
  placeId: string;
  address: string;
  phone: string;
  website: string;
  categories: string[];
  primaryCategory: string;
  description: string;
  hours: BusinessHours;
  specialHours?: SpecialHours[];
  attributes: Record<string, string | boolean>;
  photoCount: number;
  totalReviews: number;
  averageRating: number;
  isVerified: boolean;
  hasBookingLink: boolean;
  hasMenuLink: boolean;
  hasMerchantLink: boolean;
  hasProducts: boolean;
  hasServices: boolean;
  serviceArea?: string[];
  keywords: string[];
  openingDate?: string;
  priceLevel?: 1 | 2 | 3 | 4;
  accessibility?: string[];
  paymentMethods?: string[];
  languages?: string[];
  highlights?: string[];
  fromTheBusiness?: string;
  mapsUrl?: string;
  lat?: number;
  lng?: number;
}

export interface SpecialHours {
  date: string;  // YYYY-MM-DD
  open?: string;
  close?: string;
  isClosed: boolean;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface Review {
  reviewId: string;
  rating: number;
  text: string;
  authorName: string;
  publishedAt: string;
  hasReply: boolean;
  replyText?: string;
  replyAt?: string;
  sentiment?: "positive" | "neutral" | "negative";
}

export interface ReviewData {
  totalCount: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  recentReviews: Review[];
  velocityPerWeek: number;
  responseRate: number;
  averageResponseTimeHours: number;
  flaggedReviews: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  lastReviewDate?: string;
  oldestReviewDate?: string;
}

// ---------------------------------------------------------------------------
// Rank Engine
// ---------------------------------------------------------------------------

export interface RankEngineParams {
  businessName: string;
  lat: number;
  lng: number;
  keywords: string[];
  gridSize?: number;
  gridSpacingKm?: number;
}

export interface GridPoint {
  index: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  address: string;
}

export interface KeywordRankResult {
  keyword: string;
  gridRanks: number[];    // 49 values; 21 = not in top 20
  avgRank: number;
  rank1Count: number;
  top3Count: number;
  top10Count: number;
  rankScore: number;      // max(0, 100 - ((avgRank - 1) * 5))
  serpResults?: SerpResult[][];  // [gridPoint][result]
}

export interface SerpResult {
  position: number;
  title: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  cid?: string;
  placeId?: string;
}

export interface HeatmapCell {
  row: number;
  col: number;
  avgRank: number;  // averaged across all keywords
  color: string;    // hex color based on rank
}

export interface RankData {
  keywords: string[];
  gridPoints: GridPoint[];
  keywordResults: KeywordRankResult[];
  overallRankScore: number;
  avgRankByKeyword: Record<string, number>;
  heatmapData: HeatmapCell[];
  totalSerpCalls: number;
  gridSize: number;
  gridSpacingKm: number;
  centerLat: number;
  centerLng: number;
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export interface CompetitorData {
  rank: number;
  name: string;
  placeId?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  avgRankAcrossGrid: number;
  top3Frequency: number;    // how many grid points they appear in top 3
  gridAppearances: number;  // how many grid points they appear at all
  websiteUrl?: string;
  phone?: string;
  photoCount?: number;
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

export interface NAPData {
  name: string;
  address: string;
  phone: string;
  website?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export type CitationMarket = "universal" | "in" | "us";
export type CitationCategory =
  | "general"
  | "healthcare"
  | "food_beverage"
  | "travel"
  | "real_estate"
  | "legal"
  | "home_services"
  | "staffing"
  | "education";

export interface CitationPlatform {
  platform: string;
  displayName: string;
  url: string;
  searchUrl?: string;
  found: boolean;
  listingUrl?: string;
  napData?: Partial<NAPData>;
  nameMatch: boolean | null;
  phoneMatch: boolean | null;
  addressMatch: boolean | null;
  websiteMatch: boolean | null;
  market: CitationMarket;
  category?: CitationCategory;
  checkMethod: "api" | "search" | "scrape" | "manual";
  error?: string;
}

export interface NAPConsistency {
  nameMatch: number;     // 0-1 fraction
  phoneMatch: number;    // 0-1 fraction
  addressMatch: number;  // 0-1 fraction
  websiteMatch: number;  // 0-1 fraction
  overall: number;       // weighted average 0-1
}

export interface CitationResult {
  totalChecked: number;
  found: number;
  notFound: number;
  platforms: CitationPlatform[];
  napConsistency: NAPConsistency;
  score: number;         // 0-100
  market: "in" | "us";
}

// ---------------------------------------------------------------------------
// Website Audit
// ---------------------------------------------------------------------------

export interface PageSpeedMetrics {
  score: number;         // 0-100
  lcp: number;           // ms (Largest Contentful Paint)
  fid: number;           // ms (First Input Delay) / INP
  cls: number;           // unitless (Cumulative Layout Shift)
  fcp: number;           // ms (First Contentful Paint)
  ttfb: number;          // ms (Time to First Byte)
  tti: number;           // ms (Time to Interactive)
  tbt: number;           // ms (Total Blocking Time)
  speedIndex: number;    // ms
}

export interface PageSpeedData {
  mobile: PageSpeedMetrics;
  desktop: PageSpeedMetrics;
  /** Set when the PSI API key is missing or a run failed (see mobile/desktop metrics may be zeros). */
  error?: string;
}

export interface OnPageData {
  title: string;
  titleLength: number;
  hasKeywordInTitle: boolean;
  metaDescription: string;
  metaDescriptionLength: number;
  h1Count: number;
  h1Text: string[];
  h2Count: number;
  h2Text: string[];
  imageCount: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  hasCanonical: boolean;
  canonicalUrl: string;
  hasRobotsMeta: boolean;
  robotsContent: string;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasViewport: boolean;
  hasCharset: boolean;
  langAttribute: string;
}

export interface SchemaData {
  hasSchema: boolean;
  types: string[];           // e.g. ["LocalBusiness", "Organization"]
  hasLocalBusiness: boolean;
  hasOrganization: boolean;
  hasProduct: boolean;
  hasReview: boolean;
  hasBreadcrumb: boolean;
  hasFAQ: boolean;
  extractedData?: Record<string, unknown>;
  markupMethod: "json-ld" | "microdata" | "rdfa" | "none";
  errors?: string[];
}

export interface NAPAuditData {
  nameOnSite?: string;
  addressOnSite?: string;
  phoneOnSite?: string;
  nameMatch: boolean;
  addressMatch: boolean;
  phoneMatch: boolean;
  napScore: number;       // 0-20
}

export interface TechnicalData {
  isHttps: boolean;
  hasWwwRedirect: boolean;
  hasHttpToHttpsRedirect: boolean;
  hasSitemap: boolean;
  sitemapUrl?: string;
  hasRobotsTxt: boolean;
  robotsTxtUrl?: string;
  hasMobileFriendly: boolean;
  hasAmpVersion: boolean;
  responseTime: number;  // ms
  statusCode: number;
  hasGzip: boolean;
  hasBrotli: boolean;
  serverHeader?: string;
}

export interface BacklinkData {
  domainAuthority: number;     // 0-100 (Moz)
  pageAuthority: number;       // 0-100 (Moz)
  linkingDomains: number;
  totalLinks: number;
  spamScore: number;           // 0-17 (Moz)
  error?: string;              // If Moz API unavailable
}

export interface WebsiteAuditResult {
  url: string;
  finalUrl: string;            // After redirects
  isHttps: boolean;
  hasWwwRedirect: boolean;
  performance: PageSpeedData;
  onPage: OnPageData;
  nap: NAPAuditData;
  technical: TechnicalData;
  schema: SchemaData;
  backlinks: BacklinkData;
  score: number;               // 0-100
}

// ---------------------------------------------------------------------------
// Insights (AI)
// ---------------------------------------------------------------------------

export interface PriorityAction {
  rank: 1 | 2 | 3;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  estimatedTimeDays: number;
  category: "gbp" | "reviews" | "citations" | "website" | "content" | "technical";
  specificSteps: string[];
}

export interface InsightResult {
  executiveSummary: string;
  priorityActions: PriorityAction[];
  generatedAt: string;
  model: string;
  tokensUsed?: number;
  generationDurationMs?: number;
  isFallback: boolean;   // true if AI provider failed and template was used
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ProfileCompletenessDetail {
  fieldsPresent: string[];
  fieldsMissing: string[];
  fieldScores: Record<string, number>;  // field -> points earned
  totalPoints: number;                   // max 100
}

export interface ReviewScoreDetail {
  ratingComponent: number;    // 0-25
  countComponent: number;     // 0-25
  velocityComponent: number;  // 0-25
  responseComponent: number;  // 0-15
  flagComponent: number;      // 0-10
  total: number;              // 0-100
}

export interface RankScoreDetail {
  keywordScores: Record<string, number>;  // keyword -> 0-100
  avgRanks: Record<string, number>;       // keyword -> avg rank
  overall: number;                         // 0-100
}

export interface CitationScoreDetail {
  presenceComponent: number;    // 0-50
  phoneComponent: number;       // 0-20
  addressComponent: number;     // 0-15
  nameComponent: number;        // 0-10
  websiteComponent: number;     // 0-5
  total: number;                // 0-100
}

export interface WebsiteScoreDetail {
  performanceComponent: number;  // 0-25
  onPageComponent: number;       // 0-25
  napComponent: number;          // 0-20
  technicalComponent: number;    // 0-20
  backlinksComponent: number;    // 0-10
  total: number;                 // 0-100
}

export interface ScoreWeights {
  rank: 0.25;
  citations: 0.20;
  profileCompleteness: 0.15;
  profileSeo: 0.15;
  website: 0.15;
  reviews: 0.10;
}

export interface ScoreBreakdown {
  profileCompleteness: number;
  profileSeo: number;
  reviews: number;
  citations: number;
  rank: number;
  website: number;
  overall: number;
  weights: ScoreWeights;
  componentDetails?: {
    profileCompleteness: ProfileCompletenessDetail;
    reviews: ReviewScoreDetail;
    rank: RankScoreDetail;
    citations: CitationScoreDetail;
    website: WebsiteScoreDetail;
  };
}

export interface ScoringInput {
  gbp: GBPData;
  reviews: ReviewData;
  rankings: RankData;
  citations: CitationResult;
  website: WebsiteAuditResult;
  keywords: string[];
}

// ---------------------------------------------------------------------------
// Report Renderer
// ---------------------------------------------------------------------------

export interface ReportSection {
  id: string;
  title: string;
  content: unknown;
  order: number;
  visible: boolean;
}

export interface ReportTemplateData {
  report: AuditReport;
  scores: ScoreBreakdown;
  generatedAt: string;
  sections: ReportSection[];
  brandColor: string;
  agencyLogo?: string;
  agencyName?: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface CreateReportResponse {
  uuid: string;
  jobId: string;
  status: JobStatus;
  estimatedSeconds: number;
  statusUrl: string;
  reportUrl: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  field?: string;
  details?: unknown;
}

export interface StatusResponse {
  uuid: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  steps: JobStep[];
  estimatedRemainingSeconds?: number;
}

// ---------------------------------------------------------------------------
// Config Types
// ---------------------------------------------------------------------------

export interface CategoryPlatformMapping {
  category: CitationCategory;
  gbpCategories: string[];   // GBP primary category strings that map to this
  platforms: {
    name: string;
    market: CitationMarket;
    url: string;
    searchUrl: string;
  }[];
}
