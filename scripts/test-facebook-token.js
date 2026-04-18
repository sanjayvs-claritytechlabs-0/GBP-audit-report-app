/**
 * Test Facebook Graph API token used by citation-checker.
 *
 * Usage:
 *   node scripts/test-facebook-token.js --q "Hello Ortho - Napa" --lat 38.3258649 --lng -122.2926648
 *
 * Notes:
 * - Reads FACEBOOK_ACCESS_TOKEN from .env.local (project root).
 * - Does NOT print the token.
 */

const fs = require("fs");
const path = require("path");

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getArg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith("--")) return fallback;
  return val;
}

async function main() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error(`FAIL: Missing .env.local at ${envPath}`);
    process.exit(1);
  }

  const env = parseDotEnv(fs.readFileSync(envPath, "utf8"));
  const token = env.FACEBOOK_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    console.error("FAIL: FACEBOOK_ACCESS_TOKEN is not set in .env.local");
    process.exit(1);
  }

  const q = getArg("q", "Hello Ortho - Napa");
  const lat = Number(getArg("lat", "38.3258649"));
  const lng = Number(getArg("lng", "-122.2926648"));
  const version = getArg("v", "v19.0");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error("FAIL: --lat and --lng must be numbers");
    process.exit(1);
  }

  const params = new URLSearchParams({
    type: "place",
    q,
    center: `${lat},${lng}`,
    distance: "500",
    fields: "name,phone,location,website,hours",
    access_token: token,
  });

  const url = `https://graph.facebook.com/${version}/search?${params.toString()}`;

  let res;
  let json;
  try {
    res = await fetch(url, { method: "GET" });
    json = await res.json().catch(() => null);
  } catch (err) {
    console.error(`FAIL: Network error calling Facebook Graph API: ${err?.message || err}`);
    process.exit(1);
  }

  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    console.error(`FAIL: Facebook API call failed: ${msg}`);
    if (json?.error) {
      console.error("Error details:", {
        type: json.error.type,
        code: json.error.code,
        error_subcode: json.error.error_subcode,
        fbtrace_id: json.error.fbtrace_id,
      });
    }
    process.exit(1);
  }

  const count = Array.isArray(json?.data) ? json.data.length : 0;
  console.log("PASS: Facebook token worked.");
  console.log(`Query: "${q}" near (${lat}, ${lng})`);
  console.log(`Results: ${count}`);
  if (count > 0) {
    const first = json.data[0];
    console.log("First result (snippet):", {
      id: first.id,
      name: first.name,
      phone: first.phone,
      website: first.website,
      location: first.location,
    });
  }
}

main();

