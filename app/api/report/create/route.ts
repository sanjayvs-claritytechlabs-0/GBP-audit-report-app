import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { AuditJobRecord } from "@/lib/job-store";
import { persistAuditJob } from "@/lib/audit-store";

const CreateReportSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name must be 120 characters or less")
    .trim(),
  gbpUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) =>
        /maps\.app\.goo\.gl/i.test(url) ||
        /g\.co\/kgs/i.test(url) ||
        /g\.page\//i.test(url) ||
        /share\.google\//i.test(url) ||
        /google\.[a-z.]+\/maps/i.test(url) ||
        /maps\.google\.[a-z.]+/i.test(url) ||
        /business\.google\.com/i.test(url) ||
        /search\.google\.com\/local/i.test(url),
      "Must be a Google Business Profile or Google Maps URL"
    ),
  websiteUrl: z
    .string()
    .url("Must be a valid URL")
    .refine((url) => /^https?:\/\/.+\..+/i.test(url), "Must start with http:// or https://"),
  keywords: z.array(z.string().min(2).max(80).trim()).max(5, "Maximum 5 keywords allowed"),
});

/**
 * Preflight check — returns the list of missing required API keys.
 * These keys are required for real audits; without them the pipeline cannot run.
 */
function getMissingRequiredKeys(): { key: string; purpose: string; getUrl: string }[] {
  const missing: { key: string; purpose: string; getUrl: string }[] = [];

  if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
    missing.push({
      key: "GOOGLE_PLACES_API_KEY",
      purpose: "Google Business Profile data, reviews, business resolution",
      getUrl: "https://console.cloud.google.com → APIs & Services → Credentials",
    });
  }
  if (!process.env.SERPER_API_KEY) {
    missing.push({
      key: "SERPER_API_KEY",
      purpose: "Geo-grid rank tracking + citation platform verification",
      getUrl: "https://serper.dev",
    });
  }
  if (!process.env.GOOGLE_PSI_API_KEY) {
    missing.push({
      key: "GOOGLE_PSI_API_KEY",
      purpose: "Website performance audit (PageSpeed Insights)",
      getUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    });
  }
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    missing.push({
      key: "GOOGLE_GEMINI_API_KEY",
      purpose: "AI-generated executive summary + priority actions",
      getUrl: "https://aistudio.google.com/app/apikey",
    });
  }
  if (!process.env.GEMINI_MODEL) {
    missing.push({
      key: "GEMINI_MODEL",
      purpose: "Gemini model ID (Flash) used for insight generation",
      getUrl: "https://ai.google.dev/gemini-api/docs/models",
    });
  }

  return missing;
}

export async function POST(request: NextRequest) {
  try {
    const missingKeys = getMissingRequiredKeys();
    if (missingKeys.length > 0) {
      return NextResponse.json(
        {
          error: "MISSING_API_KEYS",
          message:
            "Required API keys are not configured. Add the keys listed in missingKeys and redeploy.",
          missingKeys,
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const result = CreateReportSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const uuid = uuidv4();
    const jobId = `job_${uuid}`;
    const now = new Date().toISOString();

    const job: AuditJobRecord = {
      uuid,
      jobId,
      status: "queued",
      progress: 0,
      currentStep: "Queued",
      input: result.data,
      createdAt: now,
      updatedAt: now,
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const workerRunUrl = process.env.AUDIT_WORKER_RUN_URL || "";
    const workerAuthToken = process.env.WORKER_AUTH_TOKEN || "";

    // Persist job state immediately — required for serverless polling (Vercel).
    await persistAuditJob(job);

    if (!baseUrl) {
      return NextResponse.json(
        {
          error: "MISSING_NEXT_PUBLIC_APP_URL",
          message:
            "NEXT_PUBLIC_APP_URL must be set to your deployment origin (e.g. https://your-app.vercel.app).",
        },
        { status: 503 }
      );
    }
    if (!workerRunUrl) {
      return NextResponse.json(
        {
          error: "MISSING_AUDIT_WORKER_RUN_URL",
          message:
            "Set AUDIT_WORKER_RUN_URL to your Railway worker endpoint (e.g. https://your-worker.up.railway.app/run).",
        },
        { status: 503 }
      );
    }

    // Call the Railway worker directly. The worker returns 202 immediately and runs
    // the pipeline in the background, so this fetch completes well within Vercel's
    // function timeout. No QStash retries means no duplicate pipeline runs.
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (workerAuthToken) headers["Authorization"] = `Bearer ${workerAuthToken}`;

    const workerRes = await fetch(workerRunUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ uuid, input: job.input }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!workerRes.ok) {
      const text = await workerRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "WORKER_ERROR",
          message: `Worker returned ${workerRes.status}: ${text}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        uuid,
        jobId,
        status: "queued",
        estimatedSeconds: 75,
        statusUrl: `${baseUrl}/api/report/${uuid}/status`,
        reportUrl: `${baseUrl}/report/${uuid}`,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status: 500 });
  }
}

