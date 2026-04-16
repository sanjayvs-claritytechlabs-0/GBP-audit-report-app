# Local Business SEO Audit — API Documentation

## Table of Contents

1. [REST API Endpoints](#rest-api-endpoints)
2. [Module APIs](#module-apis)
3. [External API Integrations](#external-api-integrations)
4. [Error Codes](#error-codes)
5. [Rate Limits & Costs](#rate-limits--costs)

---

## REST API Endpoints

### Base URL
- **Development:** `http://localhost:3000`
- **Production:** `https://audit.yourdomain.com`

---

### `POST /api/report/create`

Creates a new audit job and returns a job ID for polling.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "businessName": "Sharma Dental Clinic",
  "gbpUrl": "https://maps.app.goo.gl/AbCdEfGhIj",
  "websiteUrl": "https://sharmadental.in",
  "market": "in"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessName` | string | Yes | Business name (2–120 chars) |
| `gbpUrl` | string | Yes | Google Business Profile URL (any of 4 formats) |
| `websiteUrl` | string | Yes | Business website URL (must start with http/https) |
| `market` | `"in" \| "us"` | No | Market for citation checks (default: `"in"`) |

**Response 202:**
```json
{
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "jobId": "bull:report:142",
  "status": "queued",
  "estimatedSeconds": 90,
  "statusUrl": "/api/report/f47ac10b-58cc-4372-a567-0e02b2c3d479/status",
  "reportUrl": "/api/report/f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response 400 (Validation Error):**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid GBP URL format",
  "field": "gbpUrl",
  "details": ["Must be a Google Maps or Business Profile URL"]
}
```

---

### `GET /api/report/[uuid]`

Returns the full audit report when complete.

**Response 200:**
```json
{
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "complete",
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:31:28Z",
  "input": {
    "businessName": "Sharma Dental Clinic",
    "gbpUrl": "https://maps.app.goo.gl/AbCdEfGhIj",
    "websiteUrl": "https://sharmadental.in",
    "market": "in"
  },
  "scores": {
    "overall": 67.4,
    "profileCompleteness": 82,
    "profileSeo": 74,
    "reviews": 68,
    "citations": 55,
    "rank": 61,
    "website": 72,
    "breakdown": { ... }
  },
  "gbp": { ... },
  "reviews": { ... },
  "rankings": { ... },
  "competitors": [ ... ],
  "citations": { ... },
  "website": { ... },
  "insights": {
    "executiveSummary": "...",
    "priorityActions": [ ... ]
  },
  "pdfUrl": "/api/report/f47ac10b-58cc-4372-a567-0e02b2c3d479/pdf"
}
```

**Response 202 (Still processing):**
```json
{
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "processing",
  "progress": 45
}
```

**Response 404:**
```json
{
  "error": "REPORT_NOT_FOUND",
  "message": "No report found for this UUID"
}
```

---

### `GET /api/report/[uuid]/status`

Returns real-time job progress.

**Response 200:**
```json
{
  "uuid": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "processing",
  "progress": 45,
  "currentStep": "Checking keyword rankings (23/49 grid points)",
  "steps": [
    { "name": "Resolving business inputs", "status": "complete", "durationMs": 1200 },
    { "name": "Fetching GBP profile", "status": "complete", "durationMs": 800 },
    { "name": "Collecting reviews", "status": "complete", "durationMs": 950 },
    { "name": "Running geo-grid rank checks", "status": "in_progress", "durationMs": null },
    { "name": "Auditing website", "status": "pending", "durationMs": null },
    { "name": "Checking citations", "status": "pending", "durationMs": null },
    { "name": "Generating AI insights", "status": "pending", "durationMs": null },
    { "name": "Rendering PDF", "status": "pending", "durationMs": null }
  ]
}
```

**Possible status values:** `queued | processing | complete | failed`

---

### `GET /api/report/[uuid]/pdf`

Streams the generated PDF report.

**Response 200:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="seo-audit-sharma-dental-clinic.pdf"
```

**Response 404:**
```json
{
  "error": "PDF_NOT_READY",
  "message": "PDF has not been generated yet"
}
```

---

## Module APIs

### 1. `input-resolver`

**Function:** `resolveInputs(input: AuditInput): Promise<ResolvedInput>`

**Input:**
```typescript
interface AuditInput {
  businessName: string;   // 2-120 chars
  gbpUrl: string;         // Any of 4 GBP URL formats
  websiteUrl: string;     // Must start with http/https
  market?: "in" | "us";  // Default: "in"
}
```

**Output:**
```typescript
interface ResolvedInput {
  businessName: string;
  placeId: string;           // Google place_id
  cid?: string;              // Google CID (numeric)
  lat: number;
  lng: number;
  websiteUrl: string;        // Normalised (trailing slash removed, lowercase)
  market: "in" | "us";
  resolvedGbpUrl: string;    // Final redirect URL if short URL
}
```

**Supported GBP URL Formats:**
1. Short URL: `https://maps.app.goo.gl/AbCdEf` → follows 301/302 redirects
2. Full Maps URL: `https://www.google.com/maps/place/.../@lat,lng,.../data=...`
3. CID param: `https://maps.google.com/?cid=12345678`
4. GBP direct: `https://business.google.com/n/12345/profile`

---

### 2. `gbp-collector`

**Function:** `collectGBPData(placeId: string): Promise<GBPData>`

**Output:**
```typescript
interface GBPData {
  name: string;
  placeId: string;
  address: string;
  phone: string;
  website: string;
  categories: string[];
  primaryCategory: string;
  description: string;
  hours: BusinessHours;
  attributes: Record<string, string | boolean>;
  photos: number;           // Count
  totalReviews: number;
  averageRating: number;
  isVerified: boolean;
  hasBooking: boolean;
  hasMenu: boolean;
  hasMerchant: boolean;
  hasProducts: boolean;
  hasServices: boolean;
  serviceArea?: string[];
  keywords: string[];       // Extracted from name + description
  openingDate?: string;
  priceLevel?: 1 | 2 | 3 | 4;
  accessibility?: string[];
  paymentMethods?: string[];
  languages?: string[];
  highlights?: string[];
  fromTheBusiness?: string;
}
```

**25 GBP Parameters Scored:**
business_name, address, phone, website, primary_category, secondary_categories, description, hours, special_hours, photos, reviews, rating, verified, booking_link, menu_link, products, services, service_area, attributes, payment_methods, accessibility, languages, highlights, from_the_business, opening_date

---

### 3. `review-collector`

**Function:** `collectReviews(placeId: string): Promise<ReviewData>`

**Output:**
```typescript
interface ReviewData {
  totalCount: number;
  averageRating: number;
  ratingDistribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  recentReviews: Review[];
  velocityPerWeek: number;    // Reviews per week over last 12 weeks
  responseRate: number;        // 0-1 fraction of responded reviews
  averageResponseTimeHours: number;
  flaggedReviews: number;      // Reviews with policy violations
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

interface Review {
  reviewId: string;
  rating: number;
  text: string;
  authorName: string;
  publishedAt: string;
  hasReply: boolean;
  replyText?: string;
  replyAt?: string;
}
```

---

### 4. `rank-engine`

**Function:** `runRankChecks(params: RankEngineParams): Promise<RankData>`

**Input:**
```typescript
interface RankEngineParams {
  businessName: string;
  lat: number;
  lng: number;
  keywords: string[];    // 5 keywords
  gridSize?: number;     // Default: 7 (7x7 = 49 points)
  gridSpacingKm?: number; // Default: 0.5
}
```

**Output:**
```typescript
interface RankData {
  keywords: string[];
  gridPoints: GridPoint[];
  keywordResults: KeywordRankResult[];
  overallRankScore: number;
  avgRankByKeyword: Record<string, number>;
  heatmapData: HeatmapCell[];
}

interface GridPoint {
  index: number;         // 0-48
  row: number;           // 0-6
  col: number;           // 0-6
  lat: number;
  lng: number;
  address: string;       // Reverse geocoded
}

interface KeywordRankResult {
  keyword: string;
  gridRanks: number[];   // 49 values, rank 1-20, or 21 if not in top 20
  avgRank: number;
  rank1Count: number;    // How many grid points ranked #1
  top3Count: number;
  top10Count: number;
}
```

---

### 5. `scorer`

**Function:** `computeScores(data: ScoringInput): ScoreBreakdown`

**Output:**
```typescript
interface ScoreBreakdown {
  profileCompleteness: number;   // 0-100
  profileSeo: number;            // 0-100
  reviews: number;               // 0-100
  citations: number;             // 0-100
  rank: number;                  // 0-100
  website: number;               // 0-100
  overall: number;               // Weighted composite 0-100
  weights: {
    rank: 0.25;
    citations: 0.20;
    profileCompleteness: 0.15;
    profileSeo: 0.15;
    website: 0.15;
    reviews: 0.10;
  };
  componentDetails: {
    profileCompleteness: ProfileCompletenessDetail;
    reviews: ReviewScoreDetail;
    rank: RankScoreDetail;
    citations: CitationScoreDetail;
    website: WebsiteScoreDetail;
  };
}
```

**Scoring Formulas:**

| Score | Formula |
|-------|---------|
| Profile Completeness | Sum of 25 field weights (max 100) |
| Profile SEO | Keyword density in name(30) + desc(30) + categories(20) + attributes(20) |
| Review | Rating(25) + Count(25) + Velocity(25) + Response Rate(15) + No Flags(10) |
| Citation | Presence(50) + Phone accuracy(20) + Address(15) + Name(10) + Website(5) |
| Rank | `max(0, 100 - ((avgRank - 1) × 5))` averaged across 5 keywords |
| Website | Performance(25) + On-Page(25) + NAP(20) + Technical(20) + Backlinks(10) |
| **Overall** | Rank×0.25 + Citation×0.20 + ProfileCompleteness×0.15 + ProfileSEO×0.15 + Website×0.15 + Reviews×0.10 |

---

### 6. `competitor-analyzer`

**Function:** `analyzeCompetitors(rankData: RankData, businessName: string): Promise<CompetitorData[]>`

**Output:**
```typescript
interface CompetitorData {
  rank: number;               // 1-5
  name: string;
  placeId: string;
  address: string;
  rating: number;
  reviewCount: number;
  categories: string[];
  avgRank: number;            // Their average rank across grid
  top3Frequency: number;      // How often they appear in top 3
  estimatedScore?: number;    // If Places data available
  websiteUrl?: string;
  phone?: string;
}
```

---

### 7. `citation-checker`

**Function:** `checkCitations(nap: NAPData, market: "in" | "us"): Promise<CitationResult>`

**Input:**
```typescript
interface NAPData {
  name: string;
  address: string;
  phone: string;
  website?: string;
  city?: string;
  state?: string;
  pincode?: string;
}
```

**Output:**
```typescript
interface CitationResult {
  totalChecked: number;
  found: number;
  notFound: number;
  platforms: CitationPlatform[];
  napConsistency: {
    nameMatch: number;     // 0-1
    phoneMatch: number;    // 0-1
    addressMatch: number;  // 0-1
    websiteMatch: number;  // 0-1
    overall: number;       // 0-1
  };
  score: number;           // 0-100
}

interface CitationPlatform {
  platform: string;
  url: string;
  found: boolean;
  napData?: {
    name?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  nameMatch: boolean | null;
  phoneMatch: boolean | null;
  addressMatch: boolean | null;
  websiteMatch: boolean | null;
  market: "in" | "us" | "universal";
  category?: string;        // e.g., "healthcare", "food"
}
```

**Universal Platforms (both markets):**
Google, Bing Places, Apple Maps, Facebook, LinkedIn, Foursquare, Yelp, Yellow Pages, Hotfrog, Cylex

**Indian Platforms:**
JustDial, Sulekha, IndiaMart, TradeIndia, Practo (healthcare), Zomato/Swiggy (F&B), MakeMyTrip (travel), 99acres/MagicBricks (real estate), Naukri (staffing)

**US Platforms:**
BBB, Angi (Angie's List), HomeAdvisor, Thumbtack, Houzz (home), Healthgrades/Zocdoc (healthcare), TripAdvisor (travel/F&B), Avvo (legal)

---

### 8. `website-auditor`

**Function:** `auditWebsite(url: string, nap: NAPData): Promise<WebsiteAuditResult>`

**Output:**
```typescript
interface WebsiteAuditResult {
  url: string;
  isHttps: boolean;
  hasWwwRedirect: boolean;
  performance: PageSpeedData;
  onPage: OnPageData;
  nap: NAPAuditData;
  technical: TechnicalData;
  schema: SchemaData;
  backlinks: BacklinkData;
}

interface PageSpeedData {
  mobile: {
    score: number;          // 0-100
    lcp: number;            // ms
    fid: number;            // ms
    cls: number;            // unitless
    fcp: number;            // ms
    ttfb: number;           // ms
    tti: number;            // ms
  };
  desktop: {
    score: number;
    lcp: number;
    fid: number;
    cls: number;
  };
}

interface OnPageData {
  title: string;
  titleLength: number;
  hasKeywordInTitle: boolean;
  metaDescription: string;
  metaDescriptionLength: number;
  h1Count: number;
  h1Text: string[];
  h2Count: number;
  imageCount: number;
  imagesWithAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  hasCanonical: boolean;
  canonicalUrl: string;
}
```

---

### 9. `insight-engine`

**Function:** `generateInsights(report: Partial<AuditReport>): Promise<InsightResult>`

**Output:**
```typescript
interface InsightResult {
  executiveSummary: string;   // 150-200 words
  priorityActions: PriorityAction[];
  generatedAt: string;
  model: string;              // "claude-sonnet-4-6"
  tokensUsed: number;
}

interface PriorityAction {
  rank: 1 | 2 | 3;
  title: string;
  description: string;        // 50-100 words
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  estimatedTimeDays: number;
  category: "gbp" | "reviews" | "citations" | "website" | "content" | "technical";
  specificSteps: string[];    // 3-5 actionable steps
}
```

**Claude API Prompt Structure:**
```
System: You are a local SEO expert. Respond ONLY with valid JSON.
User: Analyze this audit data and provide exactly 3 priority actions...
[Full scored data injected as JSON]
```

---

### 10. `report-renderer`

**Function:** `renderReport(report: AuditReport): Promise<Buffer>`

Returns a PDF Buffer for storage/streaming.

**Input:** Full `AuditReport` object

**Output:** `Buffer` (PDF binary)

**PDF Sections:**
1. Cover page (business name, overall score, date)
2. Executive summary (Claude-generated)
3. Score overview (gauge charts)
4. Priority actions (3 cards)
5. GBP profile audit
6. Keyword ranking geo-grid heatmap
7. Competitor comparison table
8. Review analysis
9. Citation platform table
10. Website audit
11. Core Web Vitals
12. Schema markup audit
13. On-page SEO checklist
14. Technical SEO checklist
15. Backlink profile
16. Recommendations appendix

---

## External API Integrations

### Google Places API (New)

- **Endpoint:** `https://places.googleapis.com/v1/places/{place_id}`
- **Auth:** `X-Goog-Api-Key` header
- **Used by:** `input-resolver`, `gbp-collector`, `competitor-analyzer`
- **Fields mask:** `id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,regularOpeningHours,primaryTypeDisplayName,types,rating,userRatingCount,photos,priceLevel,servesVegetarianFood,accessibilityOptions`
- **Cost:** $0.017 per request (Basic Data SKU)
- **Quota:** 1,000 requests/day free, then pay-as-you-go

### Google Business Information API

- **Endpoint:** `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{accountId}/locations/{locationId}`
- **Auth:** OAuth 2.0 (service account with GBP access)
- **Used by:** `gbp-collector`
- **Note:** Requires verified GBP access. Falls back to Places API if unavailable.

### Google Geocoding API

- **Endpoint:** `https://maps.googleapis.com/maps/api/geocode/json`
- **Params:** `latlng={lat},{lng}&key={GOOGLE_MAPS_KEY}`
- **Used by:** `rank-engine` (reverse geocoding grid points)
- **Cost:** $0.005 per request; cached 7 days in Redis
- **Quota:** 40,000 requests/day

### Serper Maps API

- **Endpoint:** `https://google.serper.dev/maps`
- **Auth:** `X-API-KEY` header
- **Body:**
  ```json
  {
    "q": "keyword",
    "location": "lat,lng",
    "gl": "in",
    "hl": "en",
    "num": 20
  }
  ```
- **Used by:** `rank-engine` (245 calls per audit = 5 keywords × 49 grid points)
- **Cost:** $0.001 per call → ~$0.245 per audit
- **Rate limit:** 100 req/s; batched at 10 concurrent

### Google PageSpeed Insights API

- **Endpoint:** `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
- **Params:** `url={url}&strategy=mobile|desktop&key={PSI_KEY}`
- **Used by:** `website-auditor`
- **Cost:** Free (2,500 queries/day with API key)

### Moz API (Link Explorer)

- **Endpoint:** `https://lsapi.seomoz.com/v2/url_metrics`
- **Auth:** HTTP Basic (`accessId:secretKey`)
- **Body:** `{ "targets": ["https://example.com"] }`
- **Fields:** `domain_authority`, `page_authority`, `linking_domains`, `links_count`
- **Used by:** `website-auditor` (backlinks section)
- **Cost:** Free tier: 10 rows/request, 300 requests/month

### Anthropic Claude API

- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Auth:** `x-api-key` header
- **Model:** `claude-sonnet-4-6`
- **Used by:** `insight-engine`
- **Input tokens:** ~3,000 (audit JSON)
- **Output tokens:** ~600 (summary + actions)
- **Cost:** ~$0.01 per audit
- **SDK:** `@anthropic-ai/sdk`

### Bing Places API

- **Endpoint:** `https://bingplaces.com/PartnerApi/BusinessSearch`
- **Auth:** API key
- **Used by:** `citation-checker`

### Foursquare Places API

- **Endpoint:** `https://api.foursquare.com/v3/places/search`
- **Auth:** `Authorization: {FSQ_API_KEY}` header
- **Params:** `query={name}&near={city}&limit=5`
- **Used by:** `citation-checker`

### Facebook Graph API

- **Endpoint:** `https://graph.facebook.com/v18.0/pages/search`
- **Auth:** `access_token={FB_ACCESS_TOKEN}`
- **Params:** `q={businessName}&fields=name,phone,location,website`
- **Used by:** `citation-checker`
- **Note:** Requires approved Business app

### OSM Nominatim API

- **Endpoint:** `https://nominatim.openstreetmap.org/search`
- **Params:** `q={businessName}+{city}&format=json&limit=5`
- **Auth:** None (User-Agent header required)
- **Rate limit:** 1 req/s (strict)
- **Used by:** `citation-checker`

### Yelp Fusion API

- **Endpoint:** `https://api.yelp.com/v3/businesses/search`
- **Auth:** `Authorization: Bearer {YELP_API_KEY}`
- **Params:** `term={name}&location={city}&limit=5`
- **Used by:** `citation-checker` (US market)

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `GBP_URL_INVALID` | 400 | Cannot parse GBP URL format |
| `PLACE_NOT_FOUND` | 404 | Google Places returned no result |
| `REPORT_NOT_FOUND` | 404 | UUID does not exist |
| `PDF_NOT_READY` | 202 | Report still processing |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `EXTERNAL_API_ERROR` | 502 | Upstream API failure |
| `SERPER_QUOTA_EXCEEDED` | 402 | Serper API quota exhausted |
| `CLAUDE_API_ERROR` | 502 | Claude API failure (falls back to template) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limits & Costs

| API | Rate Limit | Cost per Audit |
|-----|-----------|----------------|
| Google Places | 1,000/day free | ~$0.10 |
| Google Geocoding | 40,000/day | ~$0.25 |
| Serper Maps | 100 req/s | ~$0.245 |
| PageSpeed Insights | 2,500/day free | $0 |
| Moz Link Explorer | 300/month free | $0 |
| Claude API | 60 RPM | ~$0.01 |
| Foursquare | 120,000/month | $0 (free tier) |
| Yelp Fusion | 500/day | $0 (free tier) |
| **Total** | — | **~$0.60/audit** |

---

## Authentication Requirements

All API keys must be set as environment variables. See `.env.example` for the complete list. Never commit real API keys to source control.

OAuth 2.0 service account credentials for GBP Business Information API should be stored as a JSON file path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`.
