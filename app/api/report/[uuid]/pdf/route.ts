import { NextRequest, NextResponse } from "next/server";
import { renderReportPDF } from "@/lib/report-renderer";
import { loadAuditReport } from "@/lib/audit-store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/report/[uuid]/pdf
 *
 * Generates and streams the PDF report on-demand (local/dev).
 * In production, this should fetch from persistent storage (e.g. R2).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  const { uuid } = params;

  const report = await loadAuditReport(uuid);
  if (!report) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: `No report found with uuid: ${uuid}` },
      { status: 404 }
    );
  }

  const pdfBuffer = await renderReportPDF(report);
  const body = new Uint8Array(pdfBuffer);

  const businessName = report.input.businessName || "local-seo-audit";
  const safeName = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName || "local-seo-audit"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
