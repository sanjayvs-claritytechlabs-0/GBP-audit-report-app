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
  } catch {
    return null;
  }
}

export async function persistAuditJob(job: AuditJobRecord): Promise<void> {
  await kv.set(jobKey(job.uuid), job);
}

export async function updateAuditJob(uuid: string, updates: Partial<AuditJobRecord>): Promise<void> {
  const existing = await loadAuditJob(uuid);
  if (!existing) return;
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

