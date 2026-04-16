import fs from "fs/promises";
import path from "path";

function isEnabled(): boolean {
  return process.env.DEBUG_PERSIST_TESTING_DATA === "true";
}

function safeSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function persistTestingJson(params: {
  uuid: string;
  category: string;
  name: string;
  data: unknown;
}): Promise<void> {
  if (!isEnabled()) return;

  const { uuid, category, name, data } = params;
  const baseDir = path.join(process.cwd(), "testing_data", safeSegment(uuid));
  const dir = path.join(baseDir, safeSegment(category));
  await ensureDir(dir);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${ts}__${safeSegment(name)}.json`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function persistTestingText(params: {
  uuid: string;
  category: string;
  name: string;
  text: string;
  ext?: "txt" | "html";
}): Promise<void> {
  if (!isEnabled()) return;

  const { uuid, category, name, text, ext = "txt" } = params;
  const baseDir = path.join(process.cwd(), "testing_data", safeSegment(uuid));
  const dir = path.join(baseDir, safeSegment(category));
  await ensureDir(dir);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${ts}__${safeSegment(name)}.${ext}`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, text, "utf-8");
}

