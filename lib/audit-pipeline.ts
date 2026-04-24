import { resolveInputs } from "@/lib/input-resolver";
import { collectGBPData } from "@/lib/gbp-collector";
import { collectReviews } from "@/lib/review-collector";
import { runRankChecks } from "@/lib/rank-engine";
import { analyzeCompetitors } from "@/lib/competitor-analyzer";
import { runCitationChecks } from "@/lib/citation-checker";
import { auditWebsite } from "@/lib/website-auditor";
import { computeAllScores } from "@/lib/scorer";
import { generateInsights } from "@/lib/insight-engine";
import { persistTestingJson } from "@/lib/testing-data";
import { persistAuditReport, updateAuditJob, loadAuditJob } from "@/lib/audit-store";
import type { AuditReport, InsightResult, PriorityAction, ScoreBreakdown } from "@/types";

export type AuditInput = {
  businessName: string;
  gbpUrl: string;
  websiteUrl: string;
  keywords: string[];
};

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

function extractCity(address: string): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim());
  return parts.length >= 3 ? parts[parts.length - 3] : parts[0];
}

function extractState(address: string): string {
  if (!address) return "";
  const parts = address.split(",").map((s) => s.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function generateFallbackInsightsFromScores(scores: ScoreBreakdown, businessName: string): InsightResult {
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
      impact: idx === 0 ? ("high" as const) : idx === 1 ? ("medium" as const) : ("low" as const),
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

export async function runAuditPipeline(uuid: string, input: AuditInput): Promise<void> {
  try {
    await updateAuditJob(uuid, {
      status: "processing",
      progress: 5,
      currentStep: "Resolving business profile",
    });

    const resolved = await resolveInputs({
      businessName: input.businessName,
      gbpUrl: input.gbpUrl,
      websiteUrl: input.websiteUrl,
    });

    await updateAuditJob(uuid, { progress: 12, currentStep: "Collecting GBP data" });
    const gbp = await collectGBPData(resolved.placeId, input.businessName, { uuid });

    await updateAuditJob(uuid, { progress: 20, currentStep: "Analyzing reviews" });
    const reviews = await collectReviews(resolved.placeId, { uuid });

    await updateAuditJob(uuid, { progress: 28, currentStep: "Checking rankings across geo-grid" });
    const keywords = input.keywords.length > 0 ? input.keywords : deriveKeywords(gbp.primaryCategory);
    const rankings = await runRankChecks(
      {
        businessName: input.businessName,
        lat: resolved.lat,
        lng: resolved.lng,
        keywords,
      },
      resolved.market,
      { uuid }
    );

    await updateAuditJob(uuid, { progress: 55, currentStep: "Auditing citations & NAP" });

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

    await updateAuditJob(uuid, { progress: 72, currentStep: "Analyzing competitors" });
    const competitors = await analyzeCompetitors(rankings, input.businessName);

    await updateAuditJob(uuid, { progress: 82, currentStep: "Computing scores" });
    const scores = computeAllScores({
      gbp,
      reviews,
      rankings,
      citations,
      website,
      keywords,
    });

    await updateAuditJob(uuid, { progress: 88, currentStep: "Generating AI insights" });

    let insights: InsightResult;
    try {
      insights = await withTimeout(
        generateInsights({
          businessName: input.businessName,
          scores,
          gbp,
          reviews,
          citations,
          website,
          keywords,
          debug: { uuid },
        }),
        35_000,
        "AI insight generation timed out"
      );
    } catch {
      insights = generateFallbackInsightsFromScores(scores, input.businessName);
    }

    await updateAuditJob(uuid, { progress: 95, currentStep: "Building report" });

    const createdAt = (await loadAuditJob(uuid))?.createdAt || new Date().toISOString();
    const report: AuditReport = {
      uuid,
      status: "complete",
      createdAt,
      completedAt: new Date().toISOString(),
      input: {
        businessName: input.businessName,
        gbpUrl: input.gbpUrl,
        websiteUrl: input.websiteUrl,
        keywords: input.keywords,
      },
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

    await persistTestingJson({
      uuid,
      category: "report",
      name: "report-data",
      data: report,
    });

    await persistAuditReport(uuid, report);

    await updateAuditJob(uuid, {
      status: "complete",
      progress: 100,
      currentStep: "Complete",
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    await updateAuditJob(uuid, {
      status: "failed",
      currentStep: "Failed",
      error: message,
    });
  }
}

