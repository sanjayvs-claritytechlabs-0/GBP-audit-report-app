import { Redis } from "@upstash/redis";
import type { AuditJobRecord } from "@/lib/job-store";
import type { AuditReport } from "@/types";

// Use @upstash/redis directly so this module works correctly on Railway
// (non-Vercel environments). @vercel/kv wraps @upstash/redis but can have
// connection-pool issues after long idle periods (e.g. the 30s citations step).
//
// @upstash/redis reads KV_REST_API_URL + KV_REST_API_TOKEN, which are the same
// env vars used by @vercel/kv, so no environment changes are needed.
function getRedis(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be set");
  }
  return new Redis({ url, token });
}

const JOB_KEY_PREFIX = "audit:job:";
const REPORT_KEY_PREFIX = "audit:report:";

function jobKey(uuid: string): string {
  return `${JOB_KEY_PREFIX}${uuid}`;
}

function reportKey(uuid: string): string {
  return `${REPORT_KEY_PREFIX}${uuid}`;
}

/**
 * Load job state from persistent storage (Vercel KV / Upstash Redis).
 * Returns null when not present or KV is not configured.
 */
export async function loadAuditJob(uuid: string): Promise<AuditJobRecord | null> {
  try {
    const redis = getRedis();
    const job = await redis.get<AuditJobRecord>(jobKey(uuid));
    return job ?? null;
  } catch (err) {
    console.error(`[audit-store] loadAuditJob KV error for ${uuid}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function persistAuditJob(job: AuditJobRecord): Promise<void> {
  const redis = getRedis();
  await redis.set(jobKey(job.uuid), job);
}

/**
 * Update a job record in KV. If the existing record cannot be loaded (transient
 * KV error), retries once after 500ms. Logs and skips if still unavailable so
 * callers do not silently lose status updates.
 */
export async function updateAuditJob(uuid: string, updates: Partial<AuditJobRecord>): Promise<void> {
  let existing = await loadAuditJob(uuid);

  if (!existing) {
    // Retry once after a short delay in case of a transient KV hiccup.
    await new Promise((resolve) => setTimeout(resolve, 500));
    existing = await loadAuditJob(uuid);
  }

  if (!existing) {
    console.error(`[audit-store] updateAuditJob: job ${uuid} not found in KV after retry — update dropped:`, JSON.stringify(updates));
    return;
  }

  const next: AuditJobRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await persistAuditJob(next);
}

export async function persistAuditReport(uuid: string, report: AuditReport): Promise<void> {
  const redis = getRedis();
  await redis.set(reportKey(uuid), report);
}

export async function loadAuditReport(uuid: string): Promise<AuditReport | null> {
  try {
    const redis = getRedis();
    const report = await redis.get<AuditReport>(reportKey(uuid));
    return report ?? null;
  } catch {
    return null;
  }
}

