/**
 * insight-engine.ts
 *
 * Calls Google Gemini (Flash) to generate an executive summary
 * and 3 priority actions from structured audit data.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { ScoreBreakdown, GBPData, ReviewData, CitationResult, WebsiteAuditResult, InsightResult, PriorityAction } from "@/types";
import { persistTestingJson, persistTestingText } from "@/lib/testing-data";

// ---------------------------------------------------------------------------
// Zod schema for model JSON response
// ---------------------------------------------------------------------------

const PriorityActionSchema = z.object({
  title: z.string(),
  impact_level: z.enum(["High", "Medium", "Low"]),
  effort_level: z.enum(["Quick Win", "Medium", "Complex"]),
  why_it_matters: z.string(),
  steps: z.array(z.string()).min(2).max(4),
});

const InsightResponseSchema = z.object({
  executive_summary: z.string(),
  priority_actions: z.array(PriorityActionSchema).length(3),
});

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert local SEO consultant analysing a Google Business Profile audit.
Given the JSON audit data provided, respond ONLY with a valid JSON object containing:

executive_summary: 2-3 sentence plain-language health assessment

priority_actions: exactly 3 objects, each with:
  title (string)
  impact_level: "High" | "Medium" | "Low"
  effort_level: "Quick Win" | "Medium" | "Complex"
  why_it_matters: one sentence specific to this business
  steps: array of 2-4 actionable strings

Order by: highest impact first, then lowest effort. Be specific to this business. No generic advice.
Respond with ONLY valid JSON. No markdown fences, no preamble.`;

export function buildInsightsModelInput(params: {
  businessName: string;
  scores: ScoreBreakdown;
  gbp: GBPData;
  reviews: ReviewData;
  citations: CitationResult;
  website: WebsiteAuditResult;
  /** Audit keywords (same as used for rank/profile SEO); short list for the model only. */
  keywords: string[];
}): Record<string, unknown> {
  const { businessName, scores, gbp, reviews, citations, website, keywords } = params;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    business_name: businessName,
    overall_score: r2(scores.overall),
    scores: {
      rank: r2(scores.rank),
      citations: r2(scores.citations),
      profile_completeness: r2(scores.profileCompleteness),
      profile_seo: r2(scores.profileSeo),
      website: r2(scores.website),
      reviews: r2(scores.reviews),
    },
    audit_keywords: keywords.slice(0, 8),
    gbp_category: gbp.primaryCategory,
    gbp_has_description: Boolean((gbp.description || "").trim()),
    review_count: reviews.totalCount,
    avg_rating: r2(reviews.averageRating),
    review_velocity_per_week: r2(reviews.velocityPerWeek),
    response_rate: r2(reviews.responseRate),
    citations_found: citations.found,
    citations_total: citations.totalChecked,
    nap_consistency: r2(citations.napConsistency.overall),
    website_https: website.isHttps,
    website_mobile_score: website.performance.mobile.score,
    website_lcp_ms: Math.round(website.performance.mobile.lcp),
    website_psi_note: website.performance.error ?? null,
    has_local_schema: website.schema.hasLocalBusiness,
    domain_authority: website.backlinks.domainAuthority,
    backlinks_note: website.backlinks.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Gemini API Call
// ---------------------------------------------------------------------------

async function callGemini(
  auditSummary: Record<string, unknown>,
  debug?: { uuid: string }
): Promise<z.infer<typeof InsightResponseSchema>> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY not configured");
  }

  const modelName = process.env.GEMINI_MODEL;
  if (!modelName) {
    throw new Error("GEMINI_MODEL not configured");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(auditSummary) }],
      },
    ],
    generationConfig: {
      // Avoid truncating JSON mid-stream (was failing parse at 1000).
      maxOutputTokens: 4096,
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const responseText = result.response.text();
  if (debug?.uuid) {
    await persistTestingJson({
      uuid: debug.uuid,
      category: "gemini",
      name: "model-input",
      data: {
        model: modelName,
        systemPrompt: SYSTEM_PROMPT,
        input: auditSummary,
      },
    });
    await persistTestingText({
      uuid: debug.uuid,
      category: "gemini",
      name: "model-output-raw",
      text: responseText,
      ext: "txt",
    });
  }

  if (!responseText || responseText.trim().length === 0) {
    throw new Error("Gemini returned empty response");
  }

  // Strip markdown code fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Parse and validate JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  const validated = InsightResponseSchema.parse(parsed);
  if (debug?.uuid) {
    await persistTestingJson({
      uuid: debug.uuid,
      category: "gemini",
      name: "model-output-validated",
      data: validated,
    });
  }
  return validated;
}

// ---------------------------------------------------------------------------
// Fallback Template
// ---------------------------------------------------------------------------

function generateFallbackInsights(
  scores: ScoreBreakdown,
  businessName: string
): InsightResult {
  const weakest = Object.entries({
    rank: scores.rank,
    citations: scores.citations,
    profileCompleteness: scores.profileCompleteness,
    profileSeo: scores.profileSeo,
    website: scores.website,
    reviews: scores.reviews,
  }).sort(([, a], [, b]) => a - b);

  const actions: PriorityAction[] = weakest.slice(0, 3).map((entry, idx) => {
    const [category, score] = entry;
    const actionMap: Record<string, { title: string; steps: string[] }> = {
      rank: {
        title: "Improve local search rankings",
        steps: ["Optimise GBP title and categories", "Build more local citations", "Encourage customer reviews"],
      },
      citations: {
        title: "Fix citation and NAP inconsistencies",
        steps: ["Audit all listing platforms for incorrect data", "Update phone and address on mismatched platforms", "Claim missing listings"],
      },
      profileCompleteness: {
        title: "Complete your Google Business Profile",
        steps: ["Fill in all missing GBP fields", "Add more photos and services", "Publish a Google Post this week"],
      },
      profileSeo: {
        title: "Add target keywords to GBP fields",
        steps: ["Include primary keyword in business description", "Add keyword-rich service descriptions", "Optimise category selection"],
      },
      website: {
        title: "Improve website technical SEO",
        steps: ["Fix page speed issues", "Add LocalBusiness schema markup", "Ensure NAP matches GBP exactly"],
      },
      reviews: {
        title: "Boost review velocity and response rate",
        steps: ["Set up a review request workflow", "Respond to all existing reviews within 24 hours", "Address negative reviews constructively"],
      },
    };

    const action = actionMap[category] || actionMap["profileCompleteness"];

    return {
      rank: (idx + 1) as 1 | 2 | 3,
      title: action.title,
      description: `Your ${category} score is ${score}/100 — this is your #${idx + 1} improvement area.`,
      impact: idx === 0 ? "high" as const : idx === 1 ? "medium" as const : "low" as const,
      effort: "medium" as const,
      estimatedTimeDays: idx === 0 ? 3 : idx === 1 ? 5 : 7,
      category: category as PriorityAction["category"],
      specificSteps: action.steps,
    };
  });

  return {
    executiveSummary: `${businessName} has an overall local SEO health score of ${scores.overall}/100. The strongest area is ${weakest[weakest.length - 1][0]} (${weakest[weakest.length - 1][1]}/100), while ${weakest[0][0]} (${weakest[0][1]}/100) needs the most attention. Addressing the top 3 priority actions below will have the biggest impact on local search visibility.`,
    priorityActions: actions,
    generatedAt: new Date().toISOString(),
    model: "template-fallback",
    isFallback: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate AI-powered insights for the audit report.
 * Falls back to a template if Gemini is unavailable.
 */
export async function generateInsights(params: {
  businessName: string;
  scores: ScoreBreakdown;
  gbp: GBPData;
  reviews: ReviewData;
  citations: CitationResult;
  website: WebsiteAuditResult;
  keywords: string[];
  /** When `logGeminiErrors` is true, failures on the Gemini path are printed before template fallback (useful for local scripts). */
  debug?: { uuid: string; logGeminiErrors?: boolean };
}): Promise<InsightResult> {
  const { businessName, scores } = params;
  const start = Date.now();

  // Compact summary only (no full crawl/schema payloads) — keeps LLM input small.
  const auditSummary = buildInsightsModelInput(params);

  try {
    const geminiResult = await callGemini(auditSummary, params.debug);

    const mapImpact = (level: string): PriorityAction["impact"] => {
      if (level === "High") return "high";
      if (level === "Low") return "low";
      return "medium";
    };

    const mapEffort = (level: string): PriorityAction["effort"] => {
      if (level === "Quick Win") return "low";
      if (level === "Complex") return "high";
      return "medium";
    };

    const priorityActions: PriorityAction[] = geminiResult.priority_actions.map((a, i) => ({
      rank: (i + 1) as 1 | 2 | 3,
      title: a.title,
      description: a.why_it_matters,
      impact: mapImpact(a.impact_level),
      effort: mapEffort(a.effort_level),
      estimatedTimeDays: a.effort_level === "Quick Win" ? 1 : a.effort_level === "Medium" ? 5 : 14,
      category: "gbp" as const,
      specificSteps: a.steps,
    }));

    return {
      executiveSummary: geminiResult.executive_summary,
      priorityActions,
      generatedAt: new Date().toISOString(),
      model: process.env.GEMINI_MODEL as string,
      tokensUsed: undefined,
      generationDurationMs: Date.now() - start,
      isFallback: false,
    };
  } catch (err) {
    if (params.debug?.logGeminiErrors) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generateInsights] Gemini path failed, using template fallback:", msg);
    }
    return generateFallbackInsights(scores, businessName);
  }
}
