/**
 * report-renderer.ts
 *
 * Assembles all audit data into an HTML template (Handlebars),
 * then converts to PDF using Puppeteer with @sparticuz/chromium.
 */

import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import type { AuditReport, ReportTemplateData } from "@/types";

// ---------------------------------------------------------------------------
// Handlebars Helpers
// ---------------------------------------------------------------------------

/** Muted purple scale for score numerals in PDF (matches pale web report). */
Handlebars.registerHelper("scoreColor", (score: number) => {
  if (score >= 80) return "#6b5a8e";
  if (score >= 60) return "#8b7cae";
  if (score >= 40) return "#a898c4";
  return "#c4b5d6";
});

Handlebars.registerHelper("scoreGrade", (score: number) => {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
});

Handlebars.registerHelper("rankColor", (rank: number) => {
  if (rank <= 3) return "#10b981";
  if (rank <= 10) return "#f59e0b";
  return "#ef4444";
});

Handlebars.registerHelper("napBadge", (match: boolean | null) => {
  if (match === true) return new Handlebars.SafeString('<span style="color:#10b981;font-weight:600;">&#10003;</span>');
  if (match === false) return new Handlebars.SafeString('<span style="color:#ef4444;font-weight:600;">&#10007;</span>');
  return new Handlebars.SafeString('<span style="color:#94a3b8;">—</span>');
});

Handlebars.registerHelper("formatNumber", (num: number) => {
  return typeof num === "number" ? num.toLocaleString() : "—";
});

Handlebars.registerHelper("percentage", (value: number) => {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
});

Handlebars.registerHelper("round", (value: number, decimals: number) => {
  const factor = Math.pow(10, decimals || 0);
  return Math.round(value * factor) / factor;
});

Handlebars.registerHelper("divide", (a: number, b: number) => {
  const numerator = typeof a === "number" ? a : Number(a);
  const denominator = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
});

Handlebars.registerHelper("lte", (a: number, b: number) => {
  const left = typeof a === "number" ? a : Number(a);
  const right = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return left <= right;
});

/** CSS class for PSI mobile score tone (PDF website card). */
Handlebars.registerHelper("mobilePsiClass", (score: number) => {
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return "";
  if (n >= 90) return "c-good";
  if (n >= 50) return "c-warn";
  return "c-bad";
});

Handlebars.registerHelper("impactBadge", (impact: string) => {
  const styles: Record<string, string> = {
    high: "background:#fee2e2;color:#991b1b;",
    medium: "background:#fef3c7;color:#92400e;",
    low: "background:#d1fae5;color:#065f46;",
  };
  const style = styles[impact] || "background:#ede9fe;color:#5b4a78;";
  return new Handlebars.SafeString(
    `<span style="${style}padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;text-transform:uppercase;">${impact}</span>`
  );
});

Handlebars.registerHelper("effortBadge", (effort: string) => {
  return new Handlebars.SafeString(
    `<span style="background:#ede9fe;color:#5b4a78;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;text-transform:uppercase;">${effort}</span>`
  );
});

// ---------------------------------------------------------------------------
// Template Compilation
// ---------------------------------------------------------------------------

let cachedTemplate: Handlebars.TemplateDelegate | null = null;

function getTemplate(): Handlebars.TemplateDelegate {
  if (cachedTemplate) return cachedTemplate;

  const templatePath = path.join(process.cwd(), "templates", "report.hbs");
  const templateSource = fs.readFileSync(templatePath, "utf-8");
  cachedTemplate = Handlebars.compile(templateSource);
  return cachedTemplate;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the audit report to an HTML string using the Handlebars template.
 */
export function renderReportHTML(report: AuditReport): string {
  const template = getTemplate();

  const data: ReportTemplateData = {
    report,
    scores: report.scores,
    generatedAt: new Date().toISOString(),
    sections: [
      { id: "cover", title: "Cover Page", content: null, order: 1, visible: true },
      { id: "executive-summary", title: "Executive Summary", content: report.insights, order: 2, visible: true },
      { id: "priority-actions", title: "Priority Actions", content: report.insights?.priorityActions, order: 3, visible: true },
      { id: "keyword-rankings", title: "Keyword Rankings", content: report.rankings, order: 4, visible: true },
      { id: "geo-grid", title: "Geo-Grid Heat Map", content: report.rankings?.heatmapData, order: 5, visible: true },
      { id: "profile-scorecard", title: "Profile Score Card", content: report.scores, order: 6, visible: true },
      { id: "competitor-benchmarking", title: "Competitor Benchmarking", content: report.competitors, order: 7, visible: true },
      { id: "review-analytics", title: "Review Analytics", content: report.reviews, order: 8, visible: true },
      { id: "gbp-checklist", title: "GBP Checklist", content: report.gbp, order: 9, visible: true },
      { id: "citation-audit", title: "Citation & Listing Audit", content: report.citations, order: 10, visible: true },
      { id: "website-overview", title: "Website SEO Overview", content: report.website, order: 11, visible: true },
      { id: "core-web-vitals", title: "Core Web Vitals", content: report.website?.performance, order: 12, visible: true },
      { id: "on-page-audit", title: "On-Page Local SEO", content: report.website?.onPage, order: 13, visible: true },
      { id: "technical-health", title: "Technical Health", content: report.website?.technical, order: 14, visible: true },
    ],
    brandColor: "#6b5a8e",
  };

  return template(data);
}

/**
 * Generate a PDF buffer from the report HTML.
 * Uses Puppeteer with @sparticuz/chromium for serverless compatibility.
 */
export async function renderReportPDF(report: AuditReport): Promise<Buffer> {
  const html = renderReportHTML(report);

  // Dynamic import to avoid bundling Puppeteer in all API routes
  const puppeteer = await import("puppeteer");
  let chromiumArgs: string[] = [];
  let executablePath: string | undefined;

  try {
    const chromium = await import("@sparticuz/chromium");
    chromiumArgs = chromium.default.args;
    executablePath = await chromium.default.executablePath();
  } catch {
    // Fall back to local Chrome for development
  }

  const browser = await puppeteer.default.launch({
    args: executablePath ? chromiumArgs : ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: executablePath || undefined,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "10mm", left: "8mm" },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
