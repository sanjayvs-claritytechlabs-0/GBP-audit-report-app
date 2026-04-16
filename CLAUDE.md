# Local Business SEO Audit — Claude Code Context

## Project Overview

A web-based Local Business SEO Audit Report Generator built with Next.js 14 App Router and TypeScript.

**Purpose:** Given a business name, GBP URL, and website URL, produce a comprehensive 16-section PDF audit report with scores, rankings, citations, and AI-generated insights.

**Tech Stack:**
- Next.js 14 (App Router, TypeScript)
- Neon PostgreSQL (`@neondatabase/serverless`)
- Redis + BullMQ for job queuing
- Puppeteer + @sparticuz/chromium for PDF
- Claude claude-sonnet-4-6 for AI insights
- Tailwind CSS for UI
- Vitest for testing

---

## Module Map

```
/app/                     Next.js App Router
  page.tsx                Main input form (landing page)
  layout.tsx              Root layout with Inter font
  globals.css             Tailwind base styles
  report/[uuid]/page.tsx  Report viewer page
  api/
    report/
      create/route.ts     POST - create audit job
      [uuid]/route.ts     GET - fetch completed report
      [uuid]/status/route.ts  GET - job progress
      [uuid]/pdf/route.ts GET - stream PDF

/lib/                     Core business logic modules
  input-resolver.ts       Parse GBP URLs, fetch place_id + lat/lng
  gbp-collector.ts        Fetch 25 GBP parameters
  review-collector.ts     Reviews, velocity, response rate
  rank-engine.ts          7x7 geo-grid SERP checks (245 Serper calls)
  scorer.ts               All 6 sub-scores + weighted overall
  competitor-analyzer.ts  Top 5 rivals from SERP data
  citation-checker.ts     NAP consistency, 12+ platforms
  website-auditor.ts      PSI + cheerio + schema + Moz
  insight-engine.ts       Claude API executive summary
  report-renderer.ts      Handlebars → Puppeteer PDF

/types/index.ts           All shared TypeScript interfaces
/config/category-map.ts   Category → citation platform mapping
/templates/report.hbs     Handlebars HTML template for PDF
/docs/API.md              External API documentation
/docs/ARCHITECTURE.md     System design documentation
/tests/                   Vitest test suites
```

---

## Environment Variables (Required)

All must be set in `.env.local` for development, Vercel dashboard for production.

```
# Google APIs
GOOGLE_MAPS_API_KEY          Google Maps JS + Geocoding + Places (New)
GOOGLE_PLACES_API_KEY        Google Places API (New) — can be same as above
GOOGLE_PSI_API_KEY           PageSpeed Insights API key
GOOGLE_SERVICE_ACCOUNT_KEY_PATH  Path to GBP OAuth service account JSON

# Serper API (Rank Engine)
SERPER_API_KEY               serper.dev API key

# Anthropic
ANTHROPIC_API_KEY            Claude API key

# Moz
MOZ_ACCESS_ID                Moz Link Explorer access ID
MOZ_SECRET_KEY               Moz Link Explorer secret

# Foursquare
FOURSQUARE_API_KEY           Foursquare Places API v3

# Yelp (US market)
YELP_API_KEY                 Yelp Fusion API key

# Facebook
FACEBOOK_ACCESS_TOKEN        Facebook Graph API access token

# Database
DATABASE_URL                 Neon PostgreSQL connection string (pooled)

# Redis
REDIS_URL                    Upstash or Railway Redis connection string

# Cloudflare R2
R2_ACCOUNT_ID                Cloudflare account ID
R2_ACCESS_KEY_ID             R2 access key ID
R2_SECRET_ACCESS_KEY         R2 secret access key
R2_BUCKET_NAME               R2 bucket name for PDF storage

# App
NEXT_PUBLIC_APP_URL          Public base URL (https://yourdomain.com)
NEXTAUTH_SECRET              Random 32-char secret for CSRF
SENTRY_DSN                   Sentry error tracking DSN
```

---

## Scoring Formulas (Verbatim)

### Profile Completeness Score (0-100)
Score 25 GBP parameters. Each parameter has a weight (total weights = 100):
- business_name: 5, address: 5, phone: 5, website: 5
- primary_category: 8, secondary_categories: 4
- description: 8, hours: 5, special_hours: 2
- photos (min 5): 6, reviews (any): 3, rating: 2, verified: 5
- booking_link: 3, menu_link: 3, products: 3, services: 3
- service_area: 2, attributes: 3, payment_methods: 2
- accessibility: 2, languages: 2, highlights: 2
- from_the_business: 2, opening_date: 2

### Profile SEO Score (0-100)
Keyword hits in GBP fields (weighted):
- Business name: 30 pts (keyword present in name)
- Description: 30 pts (keyword density ≥ 1.5%)
- Primary category: 20 pts (category matches search intent)
- Attributes/highlights: 20 pts (relevant attributes set)

### Review Score (0-100)
- Rating component: `(averageRating / 5) × 25`
- Count component: `min(25, (reviewCount / 200) × 25)`
- Velocity component: `min(25, (velocityPerWeek / 2) × 25)`
- Response rate component: `responseRate × 15`
- No flags component: `flaggedReviews === 0 ? 10 : max(0, 10 - flaggedReviews × 2)`

### Citation & NAP Score (0-100)
- Platform presence: `(foundCount / totalChecked) × 50`
- Phone accuracy: `napConsistency.phoneMatch × 20`
- Address accuracy: `napConsistency.addressMatch × 15`
- Name accuracy: `napConsistency.nameMatch × 10`
- Website accuracy: `napConsistency.websiteMatch × 5`

### Rank Score (0-100) per keyword
`keyword_score = max(0, 100 - ((avgRank - 1) × 5))`
Overall rank score = average of 5 keyword scores

### Website SEO Score (0-100)
- Performance (PSI score): 25 pts → `(mobileScore / 100) × 25`
- On-Page: 25 pts → title(5) + meta(5) + h1(5) + alt(5) + canonical(5)
- NAP match: 20 pts → `napConsistency.overall × 20`
- Technical: 20 pts → HTTPS(5) + schema(5) + robots(3) + sitemap(3) + redirect(4)
- Backlinks: 10 pts → `min(10, (domainAuthority / 100) × 10)`

### Weighted Overall Score
```
overall = (rank × 0.25) +
          (citations × 0.20) +
          (profileCompleteness × 0.15) +
          (profileSeo × 0.15) +
          (website × 0.15) +
          (reviews × 0.10)
```

---

## Code Style Rules

1. **TypeScript strict mode** — no `any` types; use `unknown` and type guards
2. **Zod validation** on all external inputs (API route bodies, external API responses)
3. **Error handling** — all async functions must have try/catch; never throw unhandled
4. **Environment variables** — access via `process.env.VAR_NAME`; validate presence at startup
5. **Imports** — use `@/*` alias for project-root imports (e.g., `@/types`, `@/lib`)
6. **No console.log in production** — use structured logging or Sentry
7. **Functional approach** in scorer.ts — pure functions, no side effects
8. **API responses** — always return `{ error, message }` shape for errors
9. **Naming conventions:**
   - Files: `kebab-case.ts`
   - Functions: `camelCase`
   - Types/Interfaces: `PascalCase`
   - Constants: `UPPER_SNAKE_CASE`
10. **Comments** — JSDoc on all exported functions; inline comments for non-obvious logic

---

## Testing Conventions

- **Framework:** Vitest
- **Test files:** `/tests/*.test.ts`
- **Fixtures:** `/tests/fixtures/*.json`
- **Mocking strategy:** Mock external APIs at the module level with `vi.mock()`
- **Test naming:** `describe("module name") > it("should do X when Y")`
- **Coverage target:** >80% for scorer.ts and input-resolver.ts
- **Run tests:** `npm run test`
- **Watch mode:** `npm run test:watch`

---

## Common Patterns

### Calling external APIs
```typescript
import axios from 'axios';

async function fetchWithRetry<T>(url: string, config: AxiosRequestConfig, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get<T>(url, config);
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Exhausted retries');
}
```

### Zod schema validation in API routes
```typescript
const schema = z.object({ ... });
const result = schema.safeParse(body);
if (!result.success) {
  return NextResponse.json({ error: 'VALIDATION_ERROR', details: result.error.issues }, { status: 400 });
}
```

### BullMQ job progress updates
```typescript
await job.updateProgress(percentage);
await job.log(`Step: ${stepName} complete in ${duration}ms`);
```
