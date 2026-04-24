import http from "http";
import { runAuditPipeline } from "@/lib/audit-pipeline";
import { persistAuditJob } from "@/lib/audit-store";
import type { AuditJobRecord } from "@/lib/job-store";

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(text);
}

type RunBody = {
  uuid: string;
  input: AuditJobRecord["input"];
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/run") {
      const expectedToken = (process.env.WORKER_AUTH_TOKEN ?? "").trim();
      if (expectedToken) {
        const provided = String(req.headers["authorization"] ?? "");
        if (provided !== `Bearer ${expectedToken}`) {
          return json(res, 401, { error: "UNAUTHORIZED" });
        }
      }

      const body = (await readJson(req)) as Partial<RunBody>;
      if (!body.uuid || !body.input) {
        return json(res, 400, { error: "BAD_REQUEST", message: "Expected { uuid, input }" });
      }

      // Ensure a job record exists in KV (useful when calling worker directly).
      const now = new Date().toISOString();
      const job: AuditJobRecord = {
        uuid: body.uuid,
        jobId: `job_${body.uuid}`,
        status: "queued",
        progress: 0,
        currentStep: "Queued",
        input: body.input,
        createdAt: now,
        updatedAt: now,
      };
      await persistAuditJob(job);

      // Run the full pipeline (serverful environment — no Vercel timeout).
      await runAuditPipeline(body.uuid, body.input);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "NOT_FOUND" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(res, 500, { error: "INTERNAL_ERROR", message: msg });
  }
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`audit worker listening on :${port}`);
});

