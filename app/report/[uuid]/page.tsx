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

function ScoreGauge({ score, size = 120, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-slate-400 font-medium">{grade}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-600 text-center">{label}</p>
    </div>
  );
}

function ScoreCard({ score, label, icon }: { score: number; label: string; icon: string }) {
  const color = score >= 80 ? "text-emerald-600 bg-emerald-50" : score >= 60 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${color}`}>
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800">{score}<span className="text-sm text-slate-400 font-normal">/100</span></p>
      </div>
      <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function NAPBadge({ match }: { match: boolean | null }) {
  if (match === true) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">&#10003;</span>;
  if (match === false) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-100 text-red-600 text-xs font-bold">&#10007;</span>;
  return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-100 text-slate-400 text-xs">—</span>;
}

export default function ReportPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let retries = 0;
    const MAX_RETRIES = 40; // ~2 minutes at 3s intervals

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
  }, [uuid]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg className="mx-auto h-10 w-10 text-[#1e3a5f] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-4 text-slate-500">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Report Unavailable</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm text-[#1e3a5f] font-medium hover:underline">Generate a new audit</a>
        </div>
      </div>
    );
  }

  const { scores, gbp, reviews, rankings, competitors, citations, website, insights } = report;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{gbp.name}</h1>
            <p className="text-blue-200 text-sm mt-1">{gbp.address} &middot; {gbp.primaryCategory}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center gap-1">
                <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-semibold">{gbp.averageRating}</span>
                <span className="text-blue-200 text-sm">({gbp.totalReviews} reviews)</span>
              </div>
              {gbp.isVerified && <span className="text-xs text-emerald-300">Verified</span>}
            </div>
            <a
              href={`/api/report/${uuid}/pdf`}
              className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/20 transition-colors"
            >
              Download PDF
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Overall Score + Executive Summary */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative flex items-center justify-center">
              <ScoreGauge score={scores.overall} size={160} label="Overall Score" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-[#1e3a5f] mb-3">Executive Summary</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{insights.executiveSummary}</p>
            </div>
          </div>
        </section>

        {/* Score Cards Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <ScoreCard score={scores.rank} label="Rank Score" icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
          <ScoreCard score={scores.citations} label="Citations & NAP" icon="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          <ScoreCard score={scores.profileCompleteness} label="Profile Completeness" icon="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
          <ScoreCard score={scores.profileSeo} label="Profile SEO" icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          <ScoreCard score={scores.reviews} label="Reviews" icon="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          <ScoreCard score={scores.website} label="Website SEO" icon="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.97.633-3.794 1.71-5.275" />
        </section>

        {/* Priority Actions */}
        <section>
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Priority Actions</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {insights.priorityActions.map((action) => (
              <div key={action.rank} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#1e3a5f] text-white text-sm font-bold">
                    {action.rank}
                  </span>
                  <div className="flex gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      action.impact === "high" ? "bg-red-100 text-red-700" : action.impact === "medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {action.impact} impact
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-semibold">
                      {action.effort} effort
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-800 text-sm mb-2">{action.title}</h3>
                <p className="text-xs text-slate-500 mb-3">{action.description}</p>
                <ul className="space-y-1.5">
                  {action.specificSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-medium">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Keyword Rankings Table */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Keyword Rankings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">Keyword</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Avg Rank</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">#1 Spots</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Top 3</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Top 10</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {rankings.keywordResults.map((kr) => (
                  <tr key={kr.keyword} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-800">{kr.keyword}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center justify-center h-7 min-w-[2rem] rounded-full px-2 text-xs font-bold ${
                        kr.avgRank <= 3 ? "bg-emerald-100 text-emerald-700" : kr.avgRank <= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      }`}>
                        {kr.avgRank.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600">{kr.rank1Count}/49</td>
                    <td className="py-3 px-4 text-center text-slate-600">{kr.top3Count}/49</td>
                    <td className="py-3 px-4 text-center text-slate-600">{kr.top10Count}/49</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-800">{kr.rankScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Competitors */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Competitor Benchmarking</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">#</th>
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">Business</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Avg Rank</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Top 3 Freq</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Rating</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.rank} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-400 font-medium">{c.rank}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{c.name}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{c.avgRankAcrossGrid}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{c.top3Frequency}/49</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {c.rating ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600">{c.reviewCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Citations & NAP */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">Citation & Listing Audit</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-emerald-600 font-semibold">{citations.found} found</span>
              <span className="text-red-500 font-semibold">{citations.notFound} missing</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium">Platform</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Found</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Name</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Phone</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Address</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Website</th>
                </tr>
              </thead>
              <tbody>
                {citations.platforms.map((p) => (
                  <tr key={p.platform} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-800">{p.displayName}</td>
                    <td className="py-3 px-4 text-center">
                      {p.found ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">&#10003;</span>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">&#10007;</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center"><NAPBadge match={p.nameMatch} /></td>
                    <td className="py-3 px-4 text-center"><NAPBadge match={p.phoneMatch} /></td>
                    <td className="py-3 px-4 text-center"><NAPBadge match={p.addressMatch} /></td>
                    <td className="py-3 px-4 text-center"><NAPBadge match={p.websiteMatch} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Website SEO */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Website SEO Audit</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Core Web Vitals */}
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Mobile Performance</h3>
              <div className="text-3xl font-bold" style={{
                color: website.performance.mobile.score >= 90 ? "#10b981" : website.performance.mobile.score >= 50 ? "#f59e0b" : "#ef4444"
              }}>{website.performance.mobile.score}</div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>LCP</span>
                  <span className={website.performance.mobile.lcp <= 2500 ? "text-emerald-600" : "text-amber-600"}>{(website.performance.mobile.lcp / 1000).toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span>CLS</span>
                  <span className={website.performance.mobile.cls <= 0.1 ? "text-emerald-600" : "text-amber-600"}>{website.performance.mobile.cls.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Technical */}
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Technical Health</h3>
              <div className="space-y-2">
                {[
                  { label: "HTTPS", pass: website.technical.isHttps },
                  { label: "Sitemap", pass: website.technical.hasSitemap },
                  { label: "Robots.txt", pass: website.technical.hasRobotsTxt },
                  { label: "Mobile Friendly", pass: website.technical.hasMobileFriendly },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{item.label}</span>
                    {item.pass ? (
                      <span className="text-emerald-600 font-semibold">Pass</span>
                    ) : (
                      <span className="text-red-500 font-semibold">Fail</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Schema */}
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Schema Markup</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">JSON-LD Present</span>
                  <span className={website.schema.hasSchema ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                    {website.schema.hasSchema ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">LocalBusiness</span>
                  <span className={website.schema.hasLocalBusiness ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                    {website.schema.hasLocalBusiness ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* Backlinks */}
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-500 mb-3">Backlink Authority</h3>
              <div className="text-3xl font-bold text-[#1e3a5f]">{website.backlinks.domainAuthority}</div>
              <p className="text-xs text-slate-400 mt-1">Domain Authority</p>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Linking Domains</span>
                  <span>{website.backlinks.linkingDomains}</span>
                </div>
                <div className="flex justify-between">
                  <span>Spam Score</span>
                  <span className={website.backlinks.spamScore < 5 ? "text-emerald-600" : "text-red-500"}>{website.backlinks.spamScore}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-slate-400">
          <p>Generated on {new Date().toLocaleDateString()} &middot; Built with Cursor</p>
          <a href="/" className="text-[#1e3a5f] font-medium hover:underline mt-2 inline-block">Generate another audit</a>
        </footer>
      </main>
    </div>
  );
}
