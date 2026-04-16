import { NextRequest, NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { buildInsightsModelInput } from "@/lib/insight-engine";

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  if (process.env.DEBUG_AI_INPUTS !== "true") {
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

  const modelInput = buildInsightsModelInput({
    businessName: report.input.businessName,
    scores: report.scores,
    gbp: report.gbp,
    reviews: report.reviews,
    citations: report.citations,
    website: report.website,
  });

  return NextResponse.json({
    uuid,
    provider: "gemini",
    model: process.env.GEMINI_MODEL ?? null,
    systemPromptIncluded: true,
    modelInput,
  });
}

