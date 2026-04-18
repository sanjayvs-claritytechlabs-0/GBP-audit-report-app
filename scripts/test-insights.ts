/**
 * Run Gemini insight generation against a saved full-report JSON (no audit pipeline).
 *
 * Usage:
 *   npx tsx scripts/test-insights.ts [path-to-report.json]
 *   npx tsx scripts/test-insights.ts --keywords "kw1,kw2,kw3" [path-to-report.json]
 *
 * Loads GOOGLE_GEMINI_API_KEY and GEMINI_MODEL from .env.local (same as the app).
 * Default report path points at the Hello Ortho sample under testing_data/ if present.
 */

import fs from "fs";
import path from "path";
import type { AuditReport } from "../types/index";
import { generateInsights } from "../lib/insight-engine";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("No .env.local found — set GOOGLE_GEMINI_API_KEY and GEMINI_MODEL in the environment.");
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]): { reportPath: string; keywordsOverride?: string[] } {
  const rest: string[] = [];
  let keywordsOverride: string[] | undefined;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--keywords=")) {
      const raw = a.slice("--keywords=".length);
      keywordsOverride = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--keywords" && argv[i + 1]) {
      keywordsOverride = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--help" || a === "-h") {
      console.log(`
Usage:
  npx tsx scripts/test-insights.ts [report.json]
  npx tsx scripts/test-insights.ts --keywords "a,b,c" [report.json]

Environment: GOOGLE_GEMINI_API_KEY, GEMINI_MODEL (from .env.local)
`);
      process.exit(0);
    } else if (!a.startsWith("--")) {
      rest.push(a);
    }
  }

  const defaultReport = path.join(
    process.cwd(),
    "testing_data",
    "85b7230a-e27e-48e9-a92d-23a67369f7ab",
    "raw_data_from_api",
    "raw_data.md"
  );

  const reportPath = rest[0] ?? defaultReport;
  return { reportPath, keywordsOverride };
}

function loadReport(filePath: string): AuditReport {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  // Allow a single-line JSON file named .md
  const data = JSON.parse(raw) as AuditReport;
  if (!data.input || !data.scores) {
    throw new Error("File does not look like a full AuditReport (missing input or scores).");
  }
  return data;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { reportPath, keywordsOverride } = parseArgs(process.argv);

  const geminiKey = (process.env.GOOGLE_GEMINI_API_KEY ?? "").trim();
  const geminiModel = (process.env.GEMINI_MODEL ?? "").trim();
  if (!geminiKey || !geminiModel) {
    console.error(
      "Preflight: GOOGLE_GEMINI_API_KEY and GEMINI_MODEL must be non-empty in .env.local (or the environment). Without them, output will be template-fallback only.\n"
    );
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`);
    console.error("Pass the path to a saved full-report JSON (e.g. exported GET /api/report/:uuid body).");
    process.exit(1);
  }

  const report = loadReport(reportPath);
  const gbp = report.gbp;
  const reviews = report.reviews;
  const citations = report.citations;
  const website = report.website;

  if (!gbp || !reviews || !citations || !website) {
    console.error("Report is missing gbp, reviews, citations, or website — export a complete report JSON.");
    process.exit(1);
  }

  const keywords =
    keywordsOverride && keywordsOverride.length > 0
      ? keywordsOverride
      : report.input.keywords?.length && report.input.keywords.length > 0
        ? report.input.keywords
        : [gbp.primaryCategory].filter(Boolean);

  console.error(`Report: ${path.resolve(reportPath)}`);
  console.error(`Business: ${report.input.businessName}`);
  console.error(`Keywords: ${JSON.stringify(keywords)}`);
  console.error("Calling generateInsights (Gemini)…\n");

  const insights = await generateInsights({
    businessName: report.input.businessName,
    scores: report.scores,
    gbp,
    reviews,
    citations,
    website,
    keywords,
    debug: { uuid: "script-test-insights", logGeminiErrors: true },
  });

  console.log(JSON.stringify({ insights }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
