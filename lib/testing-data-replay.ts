import fs from "fs/promises";
import path from "path";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadPersistedReport(uuid: string): Promise<unknown | null> {
  const reportDir = path.join(process.cwd(), "testing_data", uuid, "report");
  if (!(await fileExists(reportDir))) return null;

  // Find newest file matching *__report-data.json
  const entries = await fs.readdir(reportDir);
  const candidates = entries
    .filter((f) => f.endsWith(".json") && f.includes("report-data"))
    .sort()
    .reverse();

  if (candidates.length === 0) return null;

  const filePath = path.join(reportDir, candidates[0]);
  const text = await fs.readFile(filePath, "utf-8");
  return JSON.parse(text) as unknown;
}

