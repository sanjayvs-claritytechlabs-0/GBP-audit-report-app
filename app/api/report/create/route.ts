import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { resolveInputs } from "@/lib/input-resolver";
import { collectGBPData } from "@/lib/gbp-collector";
import { collectReviews } from "@/lib/review-collector";
import { runRankChecks } from "@/lib/rank-engine";
import { analyzeCompetitors } from "@/lib/competitor-analyzer";
import { runCitationChecks } from "@/lib/citation-checker";
import { auditWebsite } from "@/lib/website-auditor";
import { computeAllScores } from "@/lib/scorer";
import { generateInsights } from "@/lib/insight-engine";
import { getJobStore, updateJob, type AuditJobRecord } from "@/lib/job-store";
import { persistTestingJson } from "@/lib/testing-data";
import type { AuditReport } from "@/types";

const CreateReportSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name must be 120 characters or less")
    .trim(),
  gbpUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) =>
        /maps\.app\.goo\.gl/i.test(url) ||
        /g\.co\/kgs/i.test(url) ||
        /g\.page\//i.test(url) ||
        /share\.google\//i.test(url) ||
        /google\.[a-z.]+\/maps/i.test(url) ||
        /maps\.google\.[a-z.]+/i.test(url) ||
        /business\.google\.com/i.test(url) ||
        /search\.google\.com\/local/i.test(url),
      "Must be a Google Business Profile or Google Maps URL"
    ),
  websiteUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => /^https?:\/\/.+\..+/i.test(url),
      "Must start with http:// or https://"
    ),
  keywords: z
    .array(z.string().min(2).max(80).trim())
    .max(5, "Maximum 5 keywords allowed"),
});

/**
 * Derive up to 5 target keywords from the GBP primary category.
 * Focused on US Healthcare & Wellness businesses.
 */
function deriveKeywords(primaryCategory: string): string[] {
  const category = primaryCategory.toLowerCase();
  const baseKeywords = [category, `${category} near me`, `best ${category}`];

  const healthcareKeywords: Record<string, string[]> = {
    dentist: ["dental clinic near me", "emergency dentist"],
    orthodontist: ["braces near me", "invisalign provider"],
    "dental clinic": ["family dentist", "cosmetic dentist near me"],
    doctor: ["primary care physician near me", "family doctor"],
    physician: ["internal medicine doctor", "physician near me"],
    pediatrician: ["kids doctor near me", "pediatric clinic"],
    dermatologist: ["skin doctor near me", "dermatology clinic"],
    cardiologist: ["heart doctor near me", "cardiology practice"],
    orthopedic: ["orthopedic surgeon near me", "sports medicine doctor"],
    chiropractor: ["chiropractic care near me", "back pain treatment"],
    "physical therapist": ["physical therapy near me", "PT clinic"],
    optometrist: ["eye doctor near me", "vision care"],
    ophthalmologist: ["eye surgeon near me", "lasik near me"],
    psychiatrist: ["mental health provider near me", "psychiatry practice"],
    psychologist: ["therapist near me", "counseling services"],
    "urgent care": ["walk in clinic near me", "urgent care center"],
    hospital: ["emergency room near me", "hospital near me"],
    pharmacy: ["pharmacy near me", "24 hour pharmacy"],
    "medical spa": ["medspa near me", "aesthetic clinic"],
    "wellness center": ["holistic health near me", "wellness clinic"],
    acupuncture: ["acupuncturist near me", "traditional chinese medicine"],
    massage: ["massage therapy near me", "therapeutic massage"],
    nutritionist: ["dietitian near me", "nutrition counseling"],
    "mental health": ["therapist near me", "counseling near me"],
    "weight loss": ["weight loss clinic near me", "medical weight loss"],
    "pain management": ["pain clinic near me", "pain management doctor"],
    podiatrist: ["foot doctor near me", "podiatry clinic"],
    "speech therapist": ["speech therapy near me", "speech pathologist"],
    "occupational therapist": ["occupational therapy near me", "OT clinic"],
    gynecologist: ["obgyn near me", "women's health clinic"],
    urologist: ["urologist near me", "urology clinic"],
    ent: ["ear nose throat doctor", "ENT specialist near me"],
    allergist: ["allergy doctor near me", "allergy testing"],
    gastroenterologist: ["GI doctor near me", "gastroenterology clinic"],
    neurologist: ["neurologist near me", "neurology clinic"],
    pulmonologist: ["lung doctor near me", "pulmonology clinic"],
    oncologist: ["cancer doctor near me", "oncology center"],
    "plastic surgeon": ["cosmetic surgeon near me", "plastic surgery clinic"],
    "oral surgeon": ["oral surgery near me", "wisdom teeth removal"],
  };

  const extras =
    Object.entries(healthcareKeywords).find(([key]) => category.includes(key))?.[1] ??
    [`${category} clinic near me`, `${category} provider`];

  return [...baseKeywords, ...extras].slice(0, 5);
}

// ---------------------------------------------------------------------------
// POST /api/report/create
// ---------------------------------------------------------------------------

/**
 * Preflight check — returns the list of missing required API keys.
 * These 4 keys are required for real audits; without them the pipeline cannot run.
 */
function getMissingRequiredKeys(): { key: string; purpose: string; getUrl: string }[] {
  const missing: { key: string; purpose: string; getUrl: string }[] = [];

  if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
    missing.push({
      key: "GOOGLE_PLACES_API_KEY",
      purpose: "Google Business Profile data, reviews, business resolution",
      getUrl: "https://console.cloud.google.com → APIs & Services → Credentials",
    });
  }
  if (!process.env.SERPER_API_KEY) {
    missing.push({
      key: "SERPER_API_KEY",
      purpose: "Geo-grid rank tracking + citation platform verification",
      getUrl: "https://serper.dev",
    });
  }
  if (!process.env.GOOGLE_PSI_API_KEY) {
    missing.push({
      key: "GOOGLE_PSI_API_KEY",
      purpose: "Website performance audit (PageSpeed Insights)",
      getUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    });
  }
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    missing.push({
      key: "GOOGLE_GEMINI_API_KEY",
      purpose: "AI-generated executive summary + priority actions",
      getUrl: "https://aistudio.google.com/app/apikey",
    });
  }
  if (!process.env.GEMINI_MODEL) {
    missing.push({
      key: "GEMINI_MODEL",
      purpose: "Gemini model ID (Flash) used for insight generation",
      getUrl: "https://ai.google.dev/gemini-api/docs/models",
    });
  }

  return missing;
}

export async function POST(request: NextRequest) {
  try {
    // Preflight: verify required API keys are configured before kicking off a 2-minute pipeline.
    const missingKeys = getMissingRequiredKeys();
    if (missingKeys.length > 0) {
      return NextResponse.json(
        {
          error: "MISSING_API_KEYS",
          message:
            "Required API keys are not configured. Copy .env.local.template to .env.local and add your keys, then restart the dev server.",
          missingKeys,
          setupInstructions:
            "cp .env.local.template .env.local  # then edit .env.local and add the keys listed above",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const result = CreateReportSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid input",
          details: result.error.issues,
        },
        { status: 400 }
      );
    }

    const uuid = uuidv4();
    const jobId = `job_${uuid}`;
    const now = new Date().toISOString();

    const job: AuditJobRecord = {
      uuid,
      jobId,
      status: "queued",
      progress: 0,
      currentStep: "Queued",
      input: result.data,
      createdAt: now,
      updatedAt: now,
    };

    getJobStore().set(uuid, job);

    // Launch the real audit pipeline (non-blocking).
    // No hard timeout here: long audits should be allowed to finish.
    runAuditPipeline(uuid, result.data).catch((err) => {
      const message = err instanceof Error ? err.message : "Pipeline failed";
      updateJob(uuid, { status: "failed", currentStep: "Failed", error: message });
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    return NextResponse.json(
      {
        uuid,
        jobId,
        status: "queued",
        estimatedSeconds: 75,
        statusUrl: `${baseUrl}/api/report/${uuid}/status`,
        reportUrl: `${baseUrl}/report/${uuid}`,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Real Audit Pipeline
// ---------------------------------------------------------------------------

async function runAuditPipeline(
  uuid: string,
  input: { businessName: string; gbpUrl: string; websiteUrl: string; keywords: string[] }
) {
  try {
    updateJob(uuid, { status: "processing", progress: 5, currentStep: "Resolving business profile" });

    // Step 1: Resolve inputs — extract place_id, lat/lng from GBP URL
    const resolved = await resolveInputs({
      businessName: input.businessName,
      gbpUrl: input.gbpUrl,
      websiteUrl: input.websiteUrl,
    });

    updateJob(uuid, { progress: 12, currentStep: "Collecting GBP data" });

    // Step 2: Collect GBP data (pass businessName for mock fallback labeling)
    const gbp = await collectGBPData(resolved.placeId, input.businessName, { uuid });

    updateJob(uuid, { progress: 20, currentStep: "Analyzing reviews" });

    // Step 3: Collect reviews
    const reviews = await collectReviews(resolved.placeId, { uuid });

    updateJob(uuid, { progress: 28, currentStep: "Checking rankings across geo-grid" });

    // Step 4: Run rank checks (245 Serper API calls — the heavy step)
    // Use user-provided keywords; if none provided, derive from GBP category.
    const keywords = input.keywords.length > 0 ? input.keywords : deriveKeywords(gbp.primaryCategory);
    const rankings = await runRankChecks({
      businessName: input.businessName,
      lat: resolved.lat,
      lng: resolved.lng,
      keywords,
    }, resolved.market, { uuid });

    updateJob(uuid, { progress: 55, currentStep: "Auditing citations & NAP" });

    // Step 5 & 6: Citation checks and website audit run in parallel
    const canonicalNAP = {
      name: gbp.name || input.businessName,
      address: gbp.address || "",
      phone: gbp.phone || "",
      website: input.websiteUrl,
      city: "",
      state: "",
      pincode: "",
      country: "United States",
    };

    const [citations, website] = await Promise.all([
      runCitationChecks({
        name: input.businessName,
        lat: resolved.lat,
        lng: resolved.lng,
        city: extractCity(gbp.address),
        state: extractState(gbp.address),
        market: resolved.market,
        primaryCategory: gbp.primaryCategory,
        canonicalNAP,
        debug: { uuid },
      }),
      auditWebsite(input.websiteUrl, canonicalNAP, { uuid }),
    ]);

    updateJob(uuid, { progress: 72, currentStep: "Analyzing competitors" });

    // Step 7: Competitor analysis from SERP data
    const competitors = await analyzeCompetitors(rankings, input.businessName);

    updateJob(uuid, { progress: 82, currentStep: "Computing scores" });

    // Step 8: Scoring
    const scores = computeAllScores({
      gbp,
      reviews,
      rankings,
      citations,
      website,
      keywords,
    });

    updateJob(uuid, { progress: 88, currentStep: "Generating AI insights" });

    // Step 9: Gemini AI insights (with 35s timeout — falls back to template)
    let insights;
    try {
      insights = await withTimeout(
        generateInsights({
          businessName: input.businessName,
          scores,
          gbp,
          reviews,
          citations,
          website,
          debug: { uuid },
        }),
        35_000,
        "AI insight generation timed out"
      );
    } catch {
      // Fallback: generate template-based insights if Gemini fails/times out
      insights = generateFallbackInsightsFromScores(scores, input.businessName);
    }

    updateJob(uuid, { progress: 95, currentStep: "Building report" });

    // Step 10: Assemble report
    const report: AuditReport = {
      uuid,
      status: "complete",
      createdAt: getJobStore().get(uuid)?.createdAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      input: { businessName: input.businessName, gbpUrl: input.gbpUrl, websiteUrl: input.websiteUrl, keywords: input.keywords },
      resolved,
      scores,
      gbp,
      reviews,
      rankings,
      competitors,
      citations,
      website,
      insights,
      pdfUrl: undefined,
    };

    // Persist the fully assembled report for debugging/replay (no re-fetch needed)
    await persistTestingJson({
      uuid,
      category: "report",
      name: "report-data",
      data: report,
    });

    updateJob(uuid, {
      status: "complete",
      progress: 100,
      currentStep: "Complete",
      completedAt: new Date().toISOString(),
      reportData: report,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    updateJob(uuid, {
      status: "failed",
      currentStep: "Failed",
      error: message,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract city from a formatted address string. */
function extractCity(address: string): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim());
  // Usually city is the second-to-last or third-to-last part
  return parts.length >= 3 ? parts[parts.length - 3] : parts[0];
}

/** Extract state from a formatted address string. */
function extractState(address: string): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/** Inline fallback insights when Claude times out or fails — avoids importing from insight-engine. */
function generateFallbackInsightsFromScores(
  scores: import("@/types").ScoreBreakdown,
  businessName: string
): import("@/types").InsightResult {
  const weakest = Object.entries({
    rank: scores.rank,
    citations: scores.citations,
    profileCompleteness: scores.profileCompleteness,
    profileSeo: scores.profileSeo,
    website: scores.website,
    reviews: scores.reviews,
  }).sort(([, a], [, b]) => a - b);

  const actionMap: Record<string, { title: string; steps: string[] }> = {
    rank: {
      title: "Improve local search rankings",
      steps: ["Optimise GBP title and categories", "Build more local citations", "Encourage patient reviews"],
    },
    citations: {
      title: "Fix citation and NAP inconsistencies",
      steps: ["Audit all healthcare listing platforms", "Update phone/address on mismatched platforms", "Claim missing listings on Healthgrades, Zocdoc, etc."],
    },
    profileCompleteness: {
      title: "Complete your Google Business Profile",
      steps: ["Fill in all missing GBP fields", "Add more photos and services", "Publish a Google Post this week"],
    },
    profileSeo: {
      title: "Add target keywords to GBP fields",
      steps: ["Include primary specialty in business description", "Add keyword-rich service descriptions", "Optimise category selection"],
    },
    website: {
      title: "Improve website technical SEO",
      steps: ["Fix page speed issues", "Add LocalBusiness/MedicalBusiness schema markup", "Ensure NAP matches GBP exactly"],
    },
    reviews: {
      title: "Boost review velocity and response rate",
      steps: ["Set up a patient review request workflow", "Respond to all reviews within 24 hours", "Address negative reviews constructively"],
    },
  };

  const actions = weakest.slice(0, 3).map((entry, idx) => {
    const [category, score] = entry;
    const action = actionMap[category] || actionMap["profileCompleteness"];
    return {
      rank: (idx + 1) as 1 | 2 | 3,
      title: action.title,
      description: `Your ${category} score is ${score}/100 — this is your #${idx + 1} improvement area.`,
      impact: (idx === 0 ? "high" : idx === 1 ? "medium" : "low") as "high" | "medium" | "low",
      effort: "medium" as const,
      estimatedTimeDays: idx === 0 ? 3 : idx === 1 ? 5 : 7,
      category: category as "gbp" | "reviews" | "citations" | "website" | "content" | "technical",
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
