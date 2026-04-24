import { NextRequest, NextResponse } from "next/server";
import { loadAuditJob } from "@/lib/audit-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;
  const job = await loadAuditJob(uuid);

  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `No audit job found with uuid: ${uuid}` },
      { status: 404 }
    );
  }

  const elapsedMs = new Date().getTime() - new Date(job.createdAt).getTime();
  // Rank checks can be the longest step; keep the ETA conservative.
  const estimatedTotalMs = 240_000;
  const estimatedRemainingSeconds =
    job.status === "complete"
      ? 0
      : Math.max(0, Math.round((estimatedTotalMs - elapsedMs) / 1000));

  return NextResponse.json({
    uuid: job.uuid,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    estimatedRemainingSeconds,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt ?? null,
    error: job.error ?? null,
  });
}
