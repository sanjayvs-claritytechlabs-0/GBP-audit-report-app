import { NextRequest, NextResponse } from "next/server";
import { loadAuditReport } from "@/lib/audit-store";
import { loadPersistedReport } from "@/lib/testing-data-replay";

export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;
  const report = await loadAuditReport(uuid);
  if (report) return NextResponse.json(report);

  // Local/dev fallback: allow loading persisted filesystem reports when KV isn't configured.
  const persisted = await loadPersistedReport(uuid);
  if (persisted) return NextResponse.json(persisted);

  return NextResponse.json(
    { error: "NOT_FOUND", message: `No report found with uuid: ${uuid}` },
    { status: 404 }
  );
}
