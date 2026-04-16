/**
 * job-store.ts
 *
 * In-memory job store for audit pipeline runs. Shared across API routes
 * via a globalThis singleton so Next.js route isolation doesn't break it.
 *
 * TODO: Replace with Neon Postgres for production persistence.
 */

import type { AuditReport } from "@/types";

export interface AuditJobRecord {
  uuid: string;
  jobId: string;
  status: "queued" | "processing" | "complete" | "failed";
  progress: number;
  currentStep: string;
  input: {
    businessName: string;
    gbpUrl: string;
    websiteUrl: string;
    keywords: string[];
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  reportData?: AuditReport;
}

const globalStore = globalThis as unknown as {
  __auditJobs?: Map<string, AuditJobRecord>;
};

export function getJobStore(): Map<string, AuditJobRecord> {
  if (!globalStore.__auditJobs) {
    globalStore.__auditJobs = new Map();
  }
  return globalStore.__auditJobs;
}

export function updateJob(uuid: string, updates: Partial<AuditJobRecord>): void {
  const store = getJobStore();
  const job = store.get(uuid);
  if (!job) return;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
}
