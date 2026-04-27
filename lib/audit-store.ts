import { kv } from "@vercel/kv";
import type { AuditJobRecord } from "@/lib/job-store";
import type { AuditReport } from "@/types";

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
    const job = await kv.get<AuditJobRecord>(jobKey(uuid));
    return job ?? null;
  } catch (err) {
    console.error(`[audit-store] loadAuditJob KV error for ${uuid}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function persistAuditJob(job: AuditJobRecord): Promise<void> {
  await kv.set(jobKey(job.uuid), job);
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
  await kv.set(reportKey(uuid), report);
}

export async function loadAuditReport(uuid: string): Promise<AuditReport | null> {
  try {
    const report = await kv.get<AuditReport>(reportKey(uuid));
    return report ?? null;
  } catch {
    return null;
  }
}

