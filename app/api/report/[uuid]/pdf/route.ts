import { NextRequest, NextResponse } from "next/server";
import { getJobStore } from "@/lib/job-store";
import { renderReportPDF } from "@/lib/report-renderer";

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
        error: "PDF_NOT_READY",
        message: "Report is not yet complete",
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
      },
      { status: 202 }
    );
  }

  const pdfBuffer = await renderReportPDF(job.reportData);
  const body = new Uint8Array(pdfBuffer);

  const businessName = job.reportData.input.businessName || "local-seo-audit";
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
