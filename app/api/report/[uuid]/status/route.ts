import { NextRequest, NextResponse } from "next/server";
import { loadAuditJob } from "@/lib/audit-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;
  // eslint-disable-next-line no-console
  console.log(`[status] GET uuid=${uuid}`);

  let job;
  try {
    job = await loadAuditJob(uuid);
    // eslint-disable-next-line no-console
    console.log(
      `[status] KV result for ${uuid}: ${
        job ? `status=${job.status} progress=${job.progress} updatedAt=${job.updatedAt}` : "null"
      }`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[status] KV error for ${uuid}:`, msg);
    return NextResponse.json(
      { error: "KV_ERROR", message: msg },
      { status: 500 }
    );
  }

  if (!job) {
    // eslint-disable-next-line no-console
    console.warn(`[status] job not found in KV for uuid=${uuid}`);
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

  // eslint-disable-next-line no-console
  console.log(`[status] returning uuid=${uuid} status=${job.status} progress=${job.progress}`);

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
