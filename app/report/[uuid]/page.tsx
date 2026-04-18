"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface ReportData {
  uuid: string;
  status: string;
  input: { businessName: string; gbpUrl: string; websiteUrl: string };
  scores: {
    profileCompleteness: number;
    profileSeo: number;
    reviews: number;
    citations: number;
    rank: number;
    website: number;
    overall: number;
  };
  gbp: {
    name: string;
    address: string;
    phone: string;
    primaryCategory: string;
    averageRating: number;
    totalReviews: number;
    photoCount: number;
    isVerified: boolean;
  };
  reviews: {
    totalCount: number;
    averageRating: number;
    velocityPerWeek: number;
    responseRate: number;
    ratingDistribution: Record<string, number>;
  };
  rankings: {
    keywords: string[];
    keywordResults: {
      keyword: string;
      avgRank: number;
      rank1Count: number;
      top3Count: number;
      top10Count: number;
      rankScore: number;
    }[];
    overallRankScore: number;
  };
  competitors: {
    rank: number;
    name: string;
    avgRankAcrossGrid: number;
    top3Frequency: number;
    rating?: number;
    reviewCount?: number;
  }[];
  citations: {
    totalChecked: number;
    found: number;
    notFound: number;
    platforms: {
      platform: string;
      displayName: string;
      found: boolean;
      nameMatch: boolean | null;
      phoneMatch: boolean | null;
      addressMatch: boolean | null;
      websiteMatch: boolean | null;
      error?: string;
    }[];
    napConsistency: { nameMatch: number; phoneMatch: number; addressMatch: number; websiteMatch: number; overall: number };
  };
  website: {
    score: number;
    isHttps: boolean;
    performance: {
      mobile: { score: number; lcp: number; cls: number; fid: number };
      desktop: { score: number };
    };
    onPage: { title: string; h1Count: number; hasKeywordInTitle: boolean; metaDescriptionLength: number };
    schema: { hasLocalBusiness: boolean; hasSchema: boolean };
    technical: { isHttps: boolean; hasSitemap: boolean; hasRobotsTxt: boolean; hasMobileFriendly: boolean };
    backlinks: { domainAuthority: number; spamScore: number; linkingDomains: number };
  };
  insights: {
    executiveSummary: string;
    priorityActions: {
      rank: number;
      title: string;
      description: string;
      impact: string;
      effort: string;
      specificSteps: string[];
      category: string;
    }[];
  };
}

/** Open `/report/ui-preview` to render the dashboard with static data (no report APIs). */
export const MOCK_REPORT_SLUG = "ui-preview";

function createMockReport(forUuid: string): ReportData {
  return {
    uuid: forUuid,
    status: "complete",
    input: {
      businessName: "Violet Bloom Café",
      gbpUrl: "https://maps.app.goo.gl/example",
      websiteUrl: "https://example.com",
    },
    scores: {
      profileCompleteness: 82,
      profileSeo: 71,
      reviews: 76,
      citations: 64,
      rank: 58,
      website: 69,
      overall: 72,
    },
    gbp: {
      name: "Violet Bloom Café",
      address: "1420 Lavender Lane, Portland, OR 97209",
      phone: "+1 (503) 555-0142",
      primaryCategory: "Coffee shop",
      averageRating: 4.6,
      totalReviews: 218,
      photoCount: 34,
      isVerified: true,
    },
    reviews: {
      totalCount: 218,
      averageRating: 4.6,
      velocityPerWeek: 2.4,
      responseRate: 0.78,
      ratingDistribution: { "5": 140, "4": 48, "3": 18, "2": 8, "1": 4 },
    },
    rankings: {
      keywords: ["coffee near me", "best latte portland", "pastries downtown"],
      keywordResults: [
        { keyword: "coffee near me", avgRank: 4.2, rank1Count: 6, top3Count: 18, top10Count: 38, rankScore: 72 },
        { keyword: "best latte portland", avgRank: 8.1, rank1Count: 2, top3Count: 11, top10Count: 29, rankScore: 61 },
        { keyword: "pastries downtown", avgRank: 12.4, rank1Count: 0, top3Count: 7, top10Count: 22, rankScore: 48 },
      ],
      overallRankScore: 60,
    },
    competitors: [
      { rank: 1, name: "Harbor Roast House", avgRankAcrossGrid: 5.2, top3Frequency: 22, rating: 4.8, reviewCount: 412 },
      { rank: 2, name: "Violet Bloom Café", avgRankAcrossGrid: 8.2, top3Frequency: 12, rating: 4.6, reviewCount: 218 },
      { rank: 3, name: "Northside Espresso", avgRankAcrossGrid: 9.1, top3Frequency: 9, rating: 4.4, reviewCount: 156 },
    ],
    citations: {
      totalChecked: 8,
      found: 5,
      notFound: 3,
      platforms: [
        { platform: "gmb", displayName: "Google Business Profile", found: true, nameMatch: true, phoneMatch: true, addressMatch: true, websiteMatch: true },
        { platform: "yelp", displayName: "Yelp", found: true, nameMatch: true, phoneMatch: false, addressMatch: true, websiteMatch: null },
        { platform: "fb", displayName: "Facebook", found: true, nameMatch: true, phoneMatch: true, addressMatch: null, websiteMatch: true },
        { platform: "bbb", displayName: "BBB", found: false, nameMatch: null, phoneMatch: null, addressMatch: null, websiteMatch: null },
        { platform: "apple", displayName: "Apple Maps", found: true, nameMatch: true, phoneMatch: true, addressMatch: true, websiteMatch: false },
        { platform: "bing", displayName: "Bing Places", found: false, nameMatch: null, phoneMatch: null, addressMatch: null, websiteMatch: null },
        { platform: "yp", displayName: "Yellow Pages", found: false, nameMatch: null, phoneMatch: null, addressMatch: null, websiteMatch: null },
        { platform: "foursquare", displayName: "Foursquare", found: true, nameMatch: false, phoneMatch: true, addressMatch: true, websiteMatch: true },
      ],
      napConsistency: { nameMatch: 0.85, phoneMatch: 0.8, addressMatch: 0.9, websiteMatch: 0.75, overall: 0.82 },
    },
    website: {
      score: 69,
      isHttps: true,
      performance: {
        mobile: { score: 78, lcp: 2100, cls: 0.06, fid: 45 },
        desktop: { score: 92 },
      },
      onPage: { title: "Violet Bloom Café | Specialty Coffee Portland", h1Count: 1, hasKeywordInTitle: true, metaDescriptionLength: 158 },
      schema: { hasLocalBusiness: true, hasSchema: true },
      technical: { isHttps: true, hasSitemap: true, hasRobotsTxt: true, hasMobileFriendly: true },
      backlinks: { domainAuthority: 28, spamScore: 3, linkingDomains: 142 },
    },
    insights: {
      executiveSummary:
        "This preview report uses static sample data so you can review layout and styling without calling backend APIs. " +
        "In a live audit, this paragraph summarizes GBP strength, rankings, citations, reviews, and website health in a few sentences.",
      priorityActions: [
        {
          rank: 1,
          title: "Fix NAP mismatches on Yelp and Foursquare",
          description: "Phone and business name inconsistencies reduce trust signals and can dilute local pack relevance.",
          impact: "high",
          effort: "low",
          category: "citations",
          specificSteps: ["Claim or update the Yelp listing to match GBP phone.", "Standardize the display name on Foursquare.", "Re-run a citation audit after changes."],
        },
        {
          rank: 2,
          title: "Improve average rank for “pastries downtown”",
          description: "This keyword underperforms versus competitors; content and internal links can help close the gap.",
          impact: "medium",
          effort: "medium",
          category: "rankings",
          specificSteps: ["Add a dedicated pastries section on the homepage.", "Earn 2–3 relevant backlinks from local blogs.", "Refresh GBP posts weekly for 4 weeks."],
        },
        {
          rank: 3,
          title: "Expand photo set on Google Business Profile",
          description: "More recent, high-quality photos correlate with higher engagement and can lift discovery.",
          impact: "medium",
          effort: "low",
          category: "gbp",
          specificSteps: ["Upload 10 new photos (interior, menu, team).", "Geotag optional; prioritize clarity and lighting.", "Pin a seasonal post with a CTA."],
        },
      ],
    },
  };
}

const SECTION_NAV = [
  { id: "overview", label: "Overview" },
  { id: "scores", label: "Scores" },
  { id: "actions", label: "Actions" },
  { id: "rankings", label: "Rankings" },
  { id: "competitors", label: "Competitors" },
  { id: "citations", label: "Citations" },
  { id: "website", label: "Website" },
] as const;

function ScoreGauge({ score, size = 160, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 14) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const stroke =
    score >= 80 ? "#7c3aed" : score >= 60 ? "#8b5cf6" : score >= 40 ? "#a78bfa" : "#c084fc";
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ede9fe" strokeWidth="12" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight text-violet-950">{score}</span>
          <span className="text-xs font-semibold text-violet-500">{grade}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-violet-600">{label}</p>
    </div>
  );
}

function ScoreCard({ score, label, icon }: { score: number; label: string; icon: string }) {
  const bar =
    score >= 80
      ? "from-violet-600 to-fuchsia-500"
      : score >= 60
        ? "from-violet-500 to-violet-400"
        : "from-fuchsia-500 to-pink-400";
  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-white/95 p-4 shadow-sm shadow-violet-900/[0.04] backdrop-blur-sm transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-900/[0.06]">
      <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${bar}`} aria-hidden />
      <div className="flex items-center gap-4 pl-1">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-violet-600/90">{label}</p>
          <p className="text-xl font-bold text-violet-950">
            {score}
            <span className="text-sm font-normal text-violet-400">/100</span>
          </p>
        </div>
        <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-violet-100">
          <div className={`h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function NAPBadge({ match }: { match: boolean | null }) {
  if (match === true)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
        &#10003;
      </span>
    );
  if (match === false)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
        &#10007;
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs text-violet-400">—</span>
  );
}

function SectionShell({
  id,
  title,
  description,
  headerRight,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 overflow-hidden rounded-2xl border border-violet-200/70 bg-white/95 shadow-sm shadow-violet-900/[0.05] backdrop-blur-sm">
      <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50/90 via-white to-fuchsia-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-violet-950">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-violet-600/80">{description}</p> : null}
        </div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function ReportPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMockPreview = uuid === MOCK_REPORT_SLUG;

  useEffect(() => {
    if (isMockPreview) {
      setReport(createMockReport(uuid));
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let retries = 0;
    const MAX_RETRIES = 40;

    async function fetchReport() {
      try {
        const res = await fetch(`/api/report/${uuid}`);
        if (!res.ok) {
          if (res.status === 202) {
            retries++;
            if (retries > MAX_RETRIES) {
              setError("Report generation timed out. Please go back and try again.");
              setLoading(false);
              return;
            }
            setTimeout(fetchReport, 3000);
            return;
          }
          throw new Error("Failed to load report");
        }
        const data = await res.json();
        setReport(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setLoading(false);
      }
    }
    fetchReport();
  }, [uuid, isMockPreview]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-100 via-white to-fuchsia-50/50">
        <div className="text-center">
          <svg className="mx-auto h-10 w-10 animate-spin text-violet-600" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="mt-4 text-sm font-medium text-violet-700">Loading report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-100 via-white to-fuchsia-50/50 px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-violet-950">Report unavailable</h2>
          <p className="mt-2 text-sm text-violet-600">{error}</p>
          <a
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-900/20 transition hover:bg-violet-800"
          >
            Generate a new audit
          </a>
        </div>
      </div>
    );
  }

  const { scores, gbp, rankings, competitors, citations, website, insights } = report;

  return (
    <div className="min-h-screen scroll-smooth bg-gradient-to-b from-violet-100/80 via-white to-fuchsia-50/40 text-slate-800">
      <header className="relative overflow-hidden border-b border-violet-300/40 bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(196,181,253,0.5), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(232,121,249,0.25), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-200/90">
                {isMockPreview ? "Static UI preview · no API calls" : "Local SEO audit"}
              </p>
              <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{gbp.name}</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-violet-100/90">
                {gbp.address} <span className="text-violet-300/80">&middot;</span> {gbp.primaryCategory}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:shrink-0">
              <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-semibold text-white">{gbp.averageRating}</span>
                  <span className="text-sm text-violet-200">({gbp.totalReviews} reviews)</span>
                </div>
                {gbp.isVerified ? (
                  <span className="mt-1 inline-block text-xs font-medium text-emerald-300">Verified on Google</span>
                ) : null}
              </div>
              {isMockPreview ? (
                <span
                  className="inline-flex cursor-default items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-violet-200"
                  title="PDF is not available in UI preview mode"
                >
                  UI preview — no PDF
                </span>
              ) : (
                <a
                  href={`/api/report/${uuid}/pdf`}
                  className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  Download PDF
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav
        className="sticky top-0 z-10 border-b border-violet-200/80 bg-white/85 backdrop-blur-md"
        aria-label="Report sections"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6 [&::-webkit-scrollbar]:h-1.5">
          {SECTION_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 sm:text-sm"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        <SectionShell
          id="overview"
          title="Overview"
          description="Overall visibility score and executive summary."
        >
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
            <div className="shrink-0">
              <ScoreGauge score={scores.overall} size={168} label="Overall score" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-600">Executive summary</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{insights.executiveSummary}</p>
            </div>
          </div>
        </SectionShell>

        <section id="scores" className="scroll-mt-28 space-y-4">
          <div className="px-1">
            <h2 className="text-lg font-semibold tracking-tight text-violet-950">Category scores</h2>
            <p className="text-sm text-violet-600/85">How each pillar contributes to your local presence.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ScoreCard
              score={scores.rank}
              label="Rank score"
              icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
            />
            <ScoreCard
              score={scores.citations}
              label="Citations & NAP"
              icon="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
            />
            <ScoreCard
              score={scores.profileCompleteness}
              label="Profile completeness"
              icon="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
            />
            <ScoreCard
              score={scores.profileSeo}
              label="Profile SEO"
              icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
            <ScoreCard
              score={scores.reviews}
              label="Reviews"
              icon="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
            <ScoreCard
              score={scores.website}
              label="Website SEO"
              icon="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.97.633-3.794 1.71-5.275"
            />
          </div>
        </section>

        <SectionShell id="actions" title="Priority actions" description="High-impact improvements, ordered by importance.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insights.priorityActions.map((action) => (
              <article
                key={action.rank}
                className="flex flex-col rounded-xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/40 p-5 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-700 text-sm font-bold text-white shadow-sm">
                    {action.rank}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      action.impact === "high"
                        ? "bg-red-100 text-red-800"
                        : action.impact === "medium"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {action.impact} impact
                  </span>
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
                    {action.effort} effort
                  </span>
                </div>
                <h3 className="font-semibold text-violet-950">{action.title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-slate-600">{action.description}</p>
                <ul className="mt-4 space-y-2 border-t border-violet-100 pt-4">
                  {action.specificSteps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </SectionShell>

        <SectionShell id="rankings" title="Keyword rankings" description="Average position and visibility across your geo-grid.">
          <div className="overflow-hidden rounded-xl border border-violet-100">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-violet-100/90 text-left text-xs font-semibold uppercase tracking-wide text-violet-900">
                    <th className="px-4 py-3">Keyword</th>
                    <th className="px-4 py-3 text-center">Avg rank</th>
                    <th className="px-4 py-3 text-center">#1 spots</th>
                    <th className="px-4 py-3 text-center">Top 3</th>
                    <th className="px-4 py-3 text-center">Top 10</th>
                    <th className="px-4 py-3 text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100 bg-white">
                  {rankings.keywordResults.map((kr) => (
                    <tr key={kr.keyword} className="transition hover:bg-violet-50/50">
                      <td className="px-4 py-3 font-medium text-violet-950">{kr.keyword}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                            kr.avgRank <= 3
                              ? "bg-emerald-100 text-emerald-800"
                              : kr.avgRank <= 10
                                ? "bg-amber-100 text-amber-900"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {kr.avgRank.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{kr.rank1Count}/49</td>
                      <td className="px-4 py-3 text-center text-slate-600">{kr.top3Count}/49</td>
                      <td className="px-4 py-3 text-center text-slate-600">{kr.top10Count}/49</td>
                      <td className="px-4 py-3 text-center font-semibold text-violet-950">{kr.rankScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionShell>

        <SectionShell id="competitors" title="Competitor benchmarking" description="How you stack up against nearby listings.">
          <div className="overflow-hidden rounded-xl border border-violet-100">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-violet-100/90 text-left text-xs font-semibold uppercase tracking-wide text-violet-900">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3 text-center">Avg rank</th>
                    <th className="px-4 py-3 text-center">Top 3 freq</th>
                    <th className="px-4 py-3 text-center">Rating</th>
                    <th className="px-4 py-3 text-center">Reviews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100 bg-white">
                  {competitors.map((c) => (
                    <tr key={c.rank} className="transition hover:bg-violet-50/50">
                      <td className="px-4 py-3 font-medium text-violet-400">{c.rank}</td>
                      <td className="px-4 py-3 font-medium text-violet-950">{c.name}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{c.avgRankAcrossGrid}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{c.top3Frequency}/49</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center gap-1">
                          <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {c.rating ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{c.reviewCount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionShell>

        <SectionShell
          id="citations"
          title="Citation & listing audit"
          description="Directory presence and NAP consistency."
          headerRight={
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800 ring-1 ring-emerald-100">
                {citations.found} found
              </span>
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-800 ring-1 ring-red-100">
                {citations.notFound} missing
              </span>
            </div>
          }
        >
          <div className="overflow-hidden rounded-xl border border-violet-100">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-violet-100/90 text-left text-xs font-semibold uppercase tracking-wide text-violet-900">
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3 text-center">Found</th>
                    <th className="px-4 py-3 text-center">Name</th>
                    <th className="px-4 py-3 text-center">Phone</th>
                    <th className="px-4 py-3 text-center">Address</th>
                    <th className="px-4 py-3 text-center">Website</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100 bg-white">
                  {citations.platforms.map((p) => (
                    <tr key={p.platform} className="transition hover:bg-violet-50/50">
                      <td className="px-4 py-3 font-medium text-violet-950">{p.displayName}</td>
                      <td className="px-4 py-3 text-center">
                        {p.found ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                            &#10003;
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
                            &#10007;
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <NAPBadge match={p.nameMatch} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <NAPBadge match={p.phoneMatch} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <NAPBadge match={p.addressMatch} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <NAPBadge match={p.websiteMatch} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionShell>

        <SectionShell id="website" title="Website SEO audit" description="Performance, technical health, schema, and authority signals.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600">Mobile performance</h3>
              <div
                className="mt-2 text-3xl font-bold tracking-tight"
                style={{
                  color:
                    website.performance.mobile.score >= 90
                      ? "#059669"
                      : website.performance.mobile.score >= 50
                        ? "#d97706"
                        : "#dc2626",
                }}
              >
                {website.performance.mobile.score}
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <span>LCP</span>
                  <span className={website.performance.mobile.lcp <= 2500 ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                    {(website.performance.mobile.lcp / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>CLS</span>
                  <span className={website.performance.mobile.cls <= 0.1 ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                    {website.performance.mobile.cls.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600">Technical health</h3>
              <ul className="mt-3 space-y-2">
                {[
                  { label: "HTTPS", pass: website.technical.isHttps },
                  { label: "Sitemap", pass: website.technical.hasSitemap },
                  { label: "Robots.txt", pass: website.technical.hasRobotsTxt },
                  { label: "Mobile friendly", pass: website.technical.hasMobileFriendly },
                ].map((item) => (
                  <li key={item.label} className="flex items-center justify-between text-sm text-slate-700">
                    <span>{item.label}</span>
                    {item.pass ? (
                      <span className="text-xs font-semibold text-emerald-700">Pass</span>
                    ) : (
                      <span className="text-xs font-semibold text-red-600">Fail</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600">Schema markup</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex justify-between gap-2">
                  <span>JSON-LD</span>
                  <span className={website.schema.hasSchema ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
                    {website.schema.hasSchema ? "Yes" : "No"}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span>LocalBusiness</span>
                  <span className={website.schema.hasLocalBusiness ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
                    {website.schema.hasLocalBusiness ? "Yes" : "No"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-violet-100 bg-gradient-to-b from-white to-violet-50/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600">Backlink authority</h3>
              <div className="mt-2 text-3xl font-bold tracking-tight text-violet-800">{website.backlinks.domainAuthority}</div>
              <p className="mt-0.5 text-xs text-violet-500">Domain authority</p>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <span>Linking domains</span>
                  <span className="font-medium text-violet-950">{website.backlinks.linkingDomains}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Spam score</span>
                  <span className={website.backlinks.spamScore < 5 ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
                    {website.backlinks.spamScore}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SectionShell>

        <footer className="border-t border-violet-200/60 py-8 text-center text-xs text-violet-500">
          <p>Generated on {new Date().toLocaleDateString()}</p>
          <a href="/" className="mt-3 inline-block font-semibold text-violet-700 underline-offset-4 hover:underline">
            Generate another audit
          </a>
        </footer>
      </main>
    </div>
  );
}
