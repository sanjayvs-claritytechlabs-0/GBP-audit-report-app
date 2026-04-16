import { NextRequest, NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { loadPersistedReport } from "@/lib/testing-data-replay";

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;
  const store = getJobStore();
  const job = store.get(uuid);

  if (!job) {
    const persisted = await loadPersistedReport(uuid);
    if (persisted) {
      return NextResponse.json(persisted);
    }
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

  // Return the real report data assembled by the audit pipeline
  return NextResponse.json(job.reportData);
}
