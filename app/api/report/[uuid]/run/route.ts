import { NextRequest, NextResponse } from "next/server";
import { runAuditPipeline } from "@/lib/audit-pipeline";
import { loadAuditJob, updateAuditJob } from "@/lib/audit-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;

  const body = (await request.json().catch(() => null)) as { uuid?: string } | null;
  if (!body || body.uuid !== uuid) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Body uuid mismatch" },
      { status: 400 }
    );
  }

  const job = await loadAuditJob(uuid);
  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `No audit job found with uuid: ${uuid}` },
      { status: 404 }
    );
  }

  if (job.status === "processing") {
    return NextResponse.json({ status: "already_processing" }, { status: 202 });
  }
  if (job.status === "complete") {
    return NextResponse.json({ status: "already_complete" }, { status: 200 });
  }

  // Mark as processing before running (idempotency guard).
  await updateAuditJob(uuid, { status: "processing", currentStep: "Starting", progress: 1 });

  await runAuditPipeline(uuid, job.input);

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

