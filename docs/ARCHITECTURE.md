# Local Business SEO Audit — Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Map](#component-map)
3. [Data Flow](#data-flow)
4. [Module Dependency Graph](#module-dependency-graph)
5. [Database Schema](#database-schema)
6. [Queue Architecture](#queue-architecture)
7. [Caching Strategy](#caching-strategy)
8. [Deployment Architecture](#deployment-architecture)
9. [Security Considerations](#security-considerations)
10. [Scalability Notes](#scalability-notes)

---

## System Overview

```
                     ┌─────────────────────────────────────────┐
                     │          Client Browser (Next.js)        │
                     │  ┌──────────────┐  ┌──────────────────┐  │
                     │  │  Input Form  │  │  Report Viewer   │  │
                     │  │  /app/page   │  │  /app/report/    │  │
                     │  │             │  │  [uuid]/page     │  │
                     └──┴──────┬───────┴──┴────────┬─────────┴──┘
                               │POST /api/report/   │GET /api/report/
                               │create              │[uuid]
                     ┌─────────▼──────────────────────────────────┐
                     │              Next.js App (Vercel)           │
                     │  ┌─────────────────────────────────────┐    │
                     │  │            API Routes                │    │
                     │  │  /api/report/create                  │    │
                     │  │  /api/report/[uuid]                  │    │
                     │  │  /api/report/[uuid]/status           │    │
                     │  │  /api/report/[uuid]/pdf              │    │
                     │  └────────────────┬────────────────────┘    │
                     └───────────────────┼────────────────────────┘
                                         │ BullMQ Job
                     ┌───────────────────▼────────────────────────┐
                     │              Railway Worker                  │
                     │  ┌─────────────────────────────────────┐    │
                     │  │           Job Processor              │    │
                     │  │  1. input-resolver                   │    │
                     │  │  2. gbp-collector                    │    │
                     │  │  3. review-collector                 │    │
                     │  │  4. rank-engine (parallel)           │    │
                     │  │  5. website-auditor (parallel)       │    │
                     │  │  6. citation-checker (parallel)      │    │
                     │  │  7. scorer                           │    │
                     │  │  8. competitor-analyzer              │    │
                     │  │  9. insight-engine                   │    │
                     │  │  10. report-renderer                 │    │
                     │  └──────┬──────────────────────────────┘    │
                     └─────────┼──────────────────────────────────┘
                               │
              ┌────────────────┼───────────────────┐
              │                │                   │
    ┌─────────▼──────┐  ┌──────▼──────┐  ┌────────▼──────┐
    │   Neon Postgres │  │    Redis    │  │  Cloudflare R2 │
    │  (reports,     │  │ (BullMQ     │  │  (PDF storage) │
    │   agencies,    │  │  queues +   │  │               │
    │   cache)       │  │  cache)     │  │               │
    └────────────────┘  └─────────────┘  └───────────────┘
              │
    ┌─────────▼──────────────────────────────────────────┐
    │              External APIs                          │
    │  Google Places  │  Serper Maps  │  Claude API       │
    │  Google PSI     │  Moz          │  Foursquare        │
    │  Yelp           │  Facebook     │  Bing Places       │
    └────────────────────────────────────────────────────┘
```

---

## Component Map

### Next.js App (Vercel Edge/Node)

| Component | File | Responsibility |
|-----------|------|----------------|
| Input Form | `/app/page.tsx` | User input, validation UI, progress polling |
| Report Viewer | `/app/report/[uuid]/page.tsx` | Visualise complete audit data |
| Create Endpoint | `/app/api/report/create/route.ts` | Validate input, enqueue BullMQ job |
| Report Endpoint | `/app/api/report/[uuid]/route.ts` | Return report JSON from Postgres |
| Status Endpoint | `/app/api/report/[uuid]/status/route.ts` | Poll BullMQ job progress |
| PDF Endpoint | `/app/api/report/[uuid]/pdf/route.ts` | Stream PDF from R2 |

### Worker (Railway Node Process)

| Module | File | Responsibility |
|--------|------|----------------|
| Input Resolver | `/lib/input-resolver.ts` | Parse GBP URLs, get placeId + lat/lng |
| GBP Collector | `/lib/gbp-collector.ts` | Fetch 25 GBP parameters |
| Review Collector | `/lib/review-collector.ts` | Fetch reviews, compute velocity |
| Rank Engine | `/lib/rank-engine.ts` | 7×7 geo-grid SERP checks |
| Scorer | `/lib/scorer.ts` | All 6 sub-scores + weighted overall |
| Competitor Analyzer | `/lib/competitor-analyzer.ts` | Top 5 rivals from SERP data |
| Citation Checker | `/lib/citation-checker.ts` | NAP consistency across 12+ platforms |
| Website Auditor | `/lib/website-auditor.ts` | PSI + cheerio + schema analysis |
| Insight Engine | `/lib/insight-engine.ts` | Claude API executive summary |
| Report Renderer | `/lib/report-renderer.ts` | Handlebars → Puppeteer PDF |

### Shared

| Component | File | Responsibility |
|-----------|------|----------------|
| Types | `/types/index.ts` | All shared TypeScript interfaces |
| Category Map | `/config/category-map.ts` | Business category → platform mapping |
| Report Template | `/templates/report.hbs` | Handlebars HTML template for PDF |

---

## Data Flow

```
Step 1: User submits form
  Input: { businessName, gbpUrl, websiteUrl, market }
  → POST /api/report/create
  → Zod validation
  → Insert report record in Postgres (status: queued)
  → Enqueue BullMQ job with reportId + inputs
  → Return { uuid, jobId, statusUrl }

Step 2: BullMQ worker picks up job (Railway)
  → Update Postgres: status = processing

Step 3: input-resolver
  → Parse GBP URL (4 format handlers)
  → Extract place_id / CID
  → Call Google Places API for lat/lng
  → Normalise website URL
  → Store ResolvedInput in job data

Step 4: gbp-collector (sequential, uses placeId)
  → Call Google Places API (field mask: all 25 params)
  → Fallback to GBP Business Info API if available
  → Store GBPData

Step 5: review-collector (sequential, uses placeId)
  → Call Google Places API (reviews field)
  → Compute velocity: count reviews in last 12 weeks / 12
  → Compute response rate: replied / total
  → Store ReviewData

Step 6: [PARALLEL] rank-engine + website-auditor + citation-checker

  Step 6a: rank-engine
    → Build 7×7 grid centred on lat/lng (0.5km spacing)
    → Reverse geocode each grid point (Redis cached 7d)
    → Fire 49 Serper Maps calls per keyword (5 keywords)
    → Batch at 10 concurrent with p-limit
    → Record rank for target business (1-20, or 21 if not found)
    → Store RankData

  Step 6b: website-auditor
    → PSI mobile + desktop (2 API calls)
    → HTTP fetch + cheerio parse HTML
    → Extract: title, meta, h1-h6, images, links, word count
    → Detect schema.org markup (JSON-LD + microdata)
    → Compare NAP vs GBP data
    → Moz API for DA/PA + linking domains
    → Store WebsiteAuditResult

  Step 6c: citation-checker
    → Determine platform list from market + category
    → Universal platforms (10): all markets
    → Market-specific platforms (8-10): IN or US
    → Category platforms (2-4): based on GBP primary category
    → Search each platform (Foursquare API, Yelp API, Facebook API,
       Bing Places API, OSM Nominatim, Bing search fallback)
    → Normalise NAP for each result
    → Compare field-by-field with GBP NAP
    → Store CitationResult

Step 7: scorer
  → Receive all collected data
  → Compute 6 sub-scores (pure functions)
  → Compute weighted overall score
  → Store ScoreBreakdown

Step 8: competitor-analyzer
  → Extract unique business names from all SERP results
  → Deduplicate, exclude target business
  → Rank by frequency + avg rank
  → Top 5 → fetch Places data for each
  → Store CompetitorData[]

Step 9: insight-engine
  → Build structured prompt with all scores + key metrics
  → Call Claude claude-sonnet-4-6 API
  → Parse JSON response: executiveSummary + 3 priority actions
  → Retry up to 3 times on failure
  → Fall back to template-based summary if Claude fails
  → Store InsightResult

Step 10: report-renderer
  → Compile Handlebars template with full AuditReport
  → Launch Puppeteer with @sparticuz/chromium
  → Print to PDF (A4, with margins)
  → Upload PDF to Cloudflare R2
  → Store R2 object key in Postgres

Step 11: Finalise
  → Update Postgres report record:
    status = complete, completedAt = now(), data = full JSON
  → BullMQ job completes

Step 12: Client polls /api/report/[uuid]/status
  → Receives progress updates from BullMQ job metadata
  → Once status = complete, fetches full report
  → Renders report viewer page
```

---

## Module Dependency Graph

```
input-resolver
    ├── Google Places API
    └── [no other modules]

gbp-collector
    ├── input-resolver (placeId)
    └── Google Places API / GBP Business Info API

review-collector
    ├── input-resolver (placeId)
    └── Google Places API (reviews)

rank-engine
    ├── input-resolver (lat, lng)
    ├── Google Geocoding API (cached)
    └── Serper Maps API (245 calls)

website-auditor
    ├── input-resolver (websiteUrl)
    ├── gbp-collector (NAP for comparison)
    ├── Google PageSpeed Insights API
    ├── cheerio (HTML parsing)
    └── Moz API

citation-checker
    ├── input-resolver (businessName, market)
    ├── gbp-collector (NAP data)
    ├── config/category-map.ts
    ├── Foursquare API
    ├── Yelp API (US)
    ├── Facebook Graph API
    ├── Bing Places API
    └── OSM Nominatim

scorer
    ├── gbp-collector (profileCompleteness, profileSeo)
    ├── review-collector (reviewScore)
    ├── rank-engine (rankScore)
    ├── citation-checker (citationScore)
    └── website-auditor (websiteScore)

competitor-analyzer
    ├── rank-engine (SERP results)
    └── Google Places API

insight-engine
    ├── scorer (all scores)
    ├── gbp-collector
    ├── review-collector
    ├── rank-engine
    ├── citation-checker
    ├── website-auditor
    └── Claude API (claude-sonnet-4-6)

report-renderer
    ├── [all modules] (full AuditReport)
    ├── Handlebars (template)
    └── Puppeteer + @sparticuz/chromium
```

---

## Database Schema

### PostgreSQL (Neon Serverless)

```sql
-- Reports table
CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      TEXT,
  status      TEXT NOT NULL DEFAULT 'queued',
  -- queued | processing | complete | failed

  -- Input
  business_name  TEXT NOT NULL,
  gbp_url        TEXT NOT NULL,
  website_url    TEXT NOT NULL,
  market         TEXT NOT NULL DEFAULT 'in',

  -- Resolved
  place_id    TEXT,
  lat         NUMERIC(10, 7),
  lng         NUMERIC(10, 7),

  -- Output
  data        JSONB,           -- Full AuditReport JSON
  scores      JSONB,           -- ScoreBreakdown (denormalised for queries)
  pdf_key     TEXT,            -- R2 object key
  error       TEXT,            -- Error message if failed

  -- Progress
  progress    INTEGER DEFAULT 0,
  current_step TEXT,

  -- Timestamps
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Optional: agency/white-label
  agency_id   UUID REFERENCES agencies(id)
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_place_id ON reports(place_id);

-- Agencies table (for white-label)
CREATE TABLE agencies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  api_key     TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  brand_color TEXT DEFAULT '#1e3a5f',
  plan        TEXT DEFAULT 'starter',  -- starter | pro | agency
  monthly_quota INTEGER DEFAULT 50,
  used_quota  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agencies_api_key ON agencies(api_key);

-- Cached scores table (avoid re-fetching same place)
CREATE TABLE cached_scores (
  place_id    TEXT NOT NULL,
  score_type  TEXT NOT NULL,
  -- profile | reviews | rank | citations | website
  data        JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (place_id, score_type)
);

CREATE INDEX idx_cached_scores_expires ON cached_scores(expires_at);

-- Keyword rank cache (grid data is expensive to compute)
CREATE TABLE cached_rank_data (
  place_id    TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  grid_data   JSONB NOT NULL,
  cached_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (place_id, keyword)
);
```

---

## Queue Architecture

### BullMQ on Redis (Railway)

```
Queue: "report"
  ├── Job options:
  │   ├── attempts: 2
  │   ├── backoff: { type: 'exponential', delay: 5000 }
  │   └── removeOnComplete: { count: 1000 }
  │
  ├── Progress reporting:
  │   ├── job.updateProgress(percentage)
  │   └── job.log(stepName)
  │
  └── Job data structure:
      {
        reportId: UUID,
        businessName: string,
        gbpUrl: string,
        websiteUrl: string,
        market: "in" | "us"
      }
```

**Worker concurrency:** 3 (3 audits can run simultaneously per Railway instance)

**Job progress milestones:**
```
0%   → Job picked up
5%   → Input resolved
15%  → GBP profile fetched
25%  → Reviews collected
30%  → Rank engine started
65%  → Rank engine complete
70%  → Website audit complete (parallel)
75%  → Citations checked (parallel)
80%  → Scores computed
85%  → Competitors analyzed
90%  → Insights generated
95%  → PDF rendered
100% → Complete
```

---

## Caching Strategy

### Redis Cache Keys

| Key Pattern | TTL | Content |
|-------------|-----|---------|
| `geocode:{lat}:{lng}` | 7 days | Google Geocoding reverse lookup result |
| `rank:{placeId}:{keyword}:{date}` | 7 days | SERP results for a keyword + grid |
| `citation:{platform}:{placeId}` | 24 hours | Citation check result per platform |
| `places:{placeId}` | 6 hours | Google Places API response |
| `psi:{urlHash}` | 12 hours | PageSpeed Insights result |
| `moz:{domain}` | 24 hours | Moz DA/PA metrics |

### Cache Invalidation

- Rank data invalidates every Sunday at midnight (weekly fresh data)
- Citation data invalidates every 24h (NAP can change)
- GBP profile data invalidates every 6h
- PSI scores refresh every 12h

### Cache Hit Rate Target

- Geocoding: >95% (grid points repeat across audits)
- Rank data: ~40% (same business audited multiple times)
- Citation: ~30% (same place, different client)

---

## Deployment Architecture

### Vercel (Frontend + API Routes)

```
Vercel Edge Network
├── /app/* → Next.js SSR/SSG
├── /api/report/create → Node.js serverless (enqueues job)
├── /api/report/[uuid] → Node.js serverless (reads Postgres)
├── /api/report/[uuid]/status → Node.js serverless (reads Redis/BullMQ)
└── /api/report/[uuid]/pdf → Node.js serverless (streams from R2)
```

- **Region:** iad1 (US East) or bom1 (Mumbai) based on primary market
- **Function timeout:** 10s (create), 30s (status/report)
- **Environment:** Production vars in Vercel dashboard

### Railway (Worker)

```
Railway Service: "audit-worker"
├── Build: Dockerfile or nixpacks
├── Start command: node dist/worker/index.js
├── Replicas: 1-3 (auto-scale on queue depth)
├── RAM: 2GB (Puppeteer is memory-hungry)
└── CPU: 2 vCPU
```

### Neon PostgreSQL

- **Plan:** Neon Free (0.5GB) → Neon Scale for production
- **Connection:** Pooled via `@neondatabase/serverless`
- **Branching:** dev/staging/prod branches

### Redis (Upstash or Railway Redis)

- **Plan:** Upstash Free (10MB) → Upstash Pay-as-you-go
- **Used for:** BullMQ queues + application cache

### Cloudflare R2

- **Used for:** PDF storage
- **Access:** S3-compatible API via `@aws-sdk/client-s3`
- **Retention:** 30 days (then moved to Glacier equivalent)
- **Public access:** Pre-signed URLs (24h expiry)

---

## Security Considerations

### API Key Security

- All keys in `.env` files, never in code
- Vercel and Railway have separate env var stores
- Keys rotated quarterly
- Sentry alerts on 401/403 responses from external APIs

### Input Validation

- Zod schemas on all API route inputs
- GBP URL validated against allowlist of URL patterns
- Business name sanitised (max 120 chars, XSS stripped)
- Website URL validated with URL constructor
- SQL injection: impossible (Neon uses parameterised queries)

### Rate Limiting

- API routes rate-limited by IP: 10 reports/hour per IP
- Redis-backed rate limiter (sliding window)
- BullMQ queue depth cap: 1,000 jobs

### PDF Security

- PDFs served via pre-signed R2 URLs (not public)
- URL expires in 24 hours
- UUID-based routing (not guessable)
- No PII stored beyond business name + URLs

### Dependency Security

- `npm audit` run in CI on every push
- Dependabot alerts enabled
- Lock file committed (`package-lock.json`)

---

## Scalability Notes

### Bottlenecks

1. **Rank Engine (245 Serper calls):** Biggest cost and latency. Mitigated by:
   - 10-concurrent batching with `p-limit`
   - 7-day rank cache per keyword per place
   - Could reduce to 5×5 grid (25 points) for lite tier

2. **Puppeteer PDF generation:** RAM-intensive. Mitigated by:
   - `@sparticuz/chromium` (small lambda-compatible build)
   - Render in Railway worker, not Vercel (no 50MB limit)
   - Reuse browser instance across jobs (pool of 1)

3. **Postgres connection pool:** Serverless functions create new connections. Mitigated by:
   - `@neondatabase/serverless` HTTP transport (no persistent TCP)
   - PgBouncer if needed at scale

### Horizontal Scaling

- Workers are stateless (job data in Redis/Postgres)
- Add more Railway replicas to increase throughput
- BullMQ handles job distribution automatically

### Cost at Scale (100 audits/day)

| Item | Cost |
|------|------|
| Serper API | $24.50/day |
| Google APIs | $35/day |
| Claude API | $1/day |
| Railway worker | $5/month |
| Vercel Pro | $20/month |
| Neon Scale | $19/month |
| **Total** | **~$60/day API + $44/month infra** |
