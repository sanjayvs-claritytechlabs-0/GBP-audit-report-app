/**
 * Call PageSpeed Insights v5 (runPagespeed) only — same query shape as lib/website-auditor.ts.
 *
 * Usage:
 *   npx tsx scripts/test-psi.ts <https://example.com/>
 *   npx tsx scripts/test-psi.ts --desktop <url>
 *   npx tsx scripts/test-psi.ts --raw <url>   # full API JSON (large)
 *
 * Loads GOOGLE_PSI_API_KEY from .env.local (same as the app).
 */

import fs from "fs";
import path from "path";
import axios from "axios";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.warn("No .env.local — set GOOGLE_PSI_API_KEY in the environment.");
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

function parseArgs(argv: string[]): {
  url: string;
  strategy: "mobile" | "desktop";
  raw: boolean;
} {
  let strategy: "mobile" | "desktop" = "mobile";
  let raw = false;
  const rest: string[] = [];

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--desktop") strategy = "desktop";
    else if (a === "--mobile") strategy = "mobile";
    else if (a === "--raw") raw = true;
    else if (a === "--help" || a === "-h") {
      console.log(`
Usage:
  npx tsx scripts/test-psi.ts <https://example.com/>
  npx tsx scripts/test-psi.ts --desktop <url>
  npx tsx scripts/test-psi.ts --raw <url>

Environment: GOOGLE_PSI_API_KEY (.env.local)
`);
      process.exit(0);
    } else if (!a.startsWith("--")) {
      rest.push(a);
    }
  }

  const url = rest[0];
  if (!url || !/^https?:\/\//i.test(url)) {
    console.error("Pass a full URL, e.g. npx tsx scripts/test-psi.ts https://helloortho.com/");
    process.exit(1);
  }
  return { url, strategy, raw };
}

function extractMetrics(data: unknown): {
  performanceScore: number;
  lcp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  tti: number;
  tbt: number;
  speedIndex: number;
  hasLighthouse: boolean;
} {
  const d = data as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } };
      audits?: Record<string, { numericValue?: number }>;
    };
  };
  const lhr = d.lighthouseResult;
  if (!lhr?.audits) {
    return {
      performanceScore: 0,
      lcp: 0,
      cls: 0,
      fcp: 0,
      ttfb: 0,
      tti: 0,
      tbt: 0,
      speedIndex: 0,
      hasLighthouse: false,
    };
  }
  const audits = lhr.audits;
  return {
    performanceScore: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
    lcp: parseFloat(String(audits["largest-contentful-paint"]?.numericValue ?? "0")),
    cls: parseFloat(String(audits["cumulative-layout-shift"]?.numericValue ?? "0")),
    fcp: parseFloat(String(audits["first-contentful-paint"]?.numericValue ?? "0")),
    ttfb: parseFloat(String(audits["server-response-time"]?.numericValue ?? "0")),
    tti: parseFloat(String(audits["interactive"]?.numericValue ?? "0")),
    tbt: parseFloat(String(audits["total-blocking-time"]?.numericValue ?? "0")),
    speedIndex: parseFloat(String(audits["speed-index"]?.numericValue ?? "0")),
    hasLighthouse: true,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { url, strategy, raw } = parseArgs(process.argv);

  const apiKey = (process.env.GOOGLE_PSI_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("GOOGLE_PSI_API_KEY is missing or empty.");
    process.exit(1);
  }

  const params = new URLSearchParams({ url, strategy, key: apiKey });
  ["performance", "seo", "accessibility", "best-practices"].forEach((c) =>
    params.append("category", c)
  );

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  console.error(`Strategy: ${strategy}`);
  console.error(`URL: ${url}`);
  console.error(`GET pagespeedonline/v5/runPagespeed (timeout 60s)…\n`);

  try {
    const response = await axios.get(endpoint, { timeout: 60_000 });
    const data = response.data;

    if (raw) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const m = extractMetrics(data);
    const out = {
      strategy,
      url,
      id: (data as { id?: string }).id,
      performanceScore: m.performanceScore,
      metricsMs: {
        lcp: m.lcp,
        fcp: m.fcp,
        ttfb: m.ttfb,
        tti: m.tti,
        tbt: m.tbt,
        speedIndex: m.speedIndex,
      },
      cls: m.cls,
      hasLighthouseResult: m.hasLighthouse,
    };
    console.log(JSON.stringify(out, null, 2));

    if (!m.hasLighthouse) {
      console.error(
        "\nNo lighthouseResult.audits in response — PSI returned a payload the auditor cannot score (same as mobile score 0 path)."
      );
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("PSI request failed:", err.message);
      const status = err.response?.status;
      const body = err.response?.data;
      if (status != null) console.error("HTTP status:", status);
      if (body !== undefined) {
        console.error("Response body:", typeof body === "object" ? JSON.stringify(body, null, 2) : body);
      }
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
