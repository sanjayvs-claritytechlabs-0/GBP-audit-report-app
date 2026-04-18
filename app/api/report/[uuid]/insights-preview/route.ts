import { NextRequest, NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { generateInsights } from "@/lib/insight-engine";

/**
 * GET /api/report/[uuid]/insights-preview
 *
 * Runs insight generation (Gemini) alone against an already-completed job in memory.
 * Enable with DEBUG_INSIGHTS_PREVIEW=true in .env.local — off by default (returns 404).
 * Uses the same 35s timeout as the main audit pipeline.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  if (process.env.DEBUG_INSIGHTS_PREVIEW !== "true") {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Not found" },
      { status: 404 }
    );
  }

  const { uuid } = params;
  const job = getJobStore().get(uuid);

  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `No report found with uuid: ${uuid}` },
      { status: 404 }
    );
  }

  if (job.status === "failed") {
    return NextResponse.json(
      {
        error: "AUDIT_FAILED",
        message: job.error || "The audit pipeline failed",
        status: job.status,
      },
      { status: 500 }
    );
  }

  if (job.status !== "complete" || !job.reportData) {
    return NextResponse.json(
      {
        error: "NOT_READY",
        message: "Report is not yet complete",
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
      },
      { status: 202 }
    );
  }

  const report = job.reportData;
  if (!report.gbp || !report.reviews || !report.citations || !report.website) {
    return NextResponse.json(
      { error: "INCOMPLETE_REPORT", message: "Report data missing required sections" },
      { status: 500 }
    );
  }

  const keywords =
    report.input.keywords?.length && report.input.keywords.length > 0
      ? report.input.keywords
      : [report.gbp.primaryCategory].filter(Boolean);

  const timeoutMs = 35_000;

  try {
    const insights = await Promise.race([
      generateInsights({
        businessName: report.input.businessName,
        scores: report.scores,
        gbp: report.gbp,
        reviews: report.reviews,
        citations: report.citations,
        website: report.website,
        keywords,
        debug: { uuid },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Insight preview timed out")), timeoutMs)
      ),
    ]);

    return NextResponse.json({
      uuid,
      provider: "gemini",
      model: process.env.GEMINI_MODEL ?? null,
      note:
        "If isFallback is true, Gemini failed or returned invalid JSON — check GOOGLE_GEMINI_API_KEY and GEMINI_MODEL.",
      insights,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Insight preview failed";
    return NextResponse.json(
      { error: "INSIGHT_PREVIEW_FAILED", message },
      { status: 504 }
    );
  }
}
