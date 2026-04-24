import fs from "fs";
import http from "http";
import path from "path";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

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
  input: import("@/lib/job-store").AuditJobRecord["input"];
};

async function main(): Promise<void> {
  // IMPORTANT: load env BEFORE importing modules that initialize @vercel/kv.
  loadEnvLocal();

  const { runAuditPipeline } = await import("@/lib/audit-pipeline");
  const { persistAuditJob } = await import("@/lib/audit-store");

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

        const now = new Date().toISOString();
        const job: import("@/lib/job-store").AuditJobRecord = {
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

        // Do not await the full audit in this HTTP request — tunnels/proxies (zrok) will 504 on long runs.
        void runAuditPipeline(body.uuid, body.input).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`[worker] audit failed uuid=${body.uuid}:`, msg);
        });

        return json(res, 202, { ok: true, accepted: true, uuid: body.uuid });
      }

      return json(res, 404, { error: "NOT_FOUND" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(res, 500, { error: "INTERNAL_ERROR", message: msg });
    }
  });

  const port = Number(process.env.PORT || 8000);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`audit worker listening on :${port}`);
  });
}

void main();
