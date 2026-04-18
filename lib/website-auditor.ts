/**
 * website-auditor.ts
 *
 * Audits the business website for technical SEO, performance, on-page signals,
 * NAP consistency, schema markup, and backlink authority.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import type {
  WebsiteAuditResult,
  PageSpeedData,
  PageSpeedMetrics,
  OnPageData,
  SchemaData,
  NAPAuditData,
  TechnicalData,
  BacklinkData,
  NAPData,
} from "@/types";
import { persistTestingJson, persistTestingText } from "@/lib/testing-data";

// ---------------------------------------------------------------------------
// PageSpeed Insights
// ---------------------------------------------------------------------------

async function runPageSpeedInsights(
  url: string,
  strategy: "mobile" | "desktop",
  debug?: { uuid: string }
): Promise<PageSpeedMetrics> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;
  if (!apiKey) {
    return { score: 0, lcp: 0, fid: 0, cls: 0, fcp: 0, ttfb: 0, tti: 0, tbt: 0, speedIndex: 0 };
  }

  try {
    const params = new URLSearchParams({
      url,
      strategy,
      key: apiKey,
    });
    ["performance", "seo", "accessibility", "best-practices"].forEach((c) =>
      params.append("category", c)
    );

    const response = await axios.get(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { timeout: 30000 }
    );

    if (debug?.uuid) {
      await persistTestingJson({
        uuid: debug.uuid,
        category: "pagespeed",
        name: `psi-raw-${strategy}`,
        data: {
          endpoint: "pagespeedonline/v5/runPagespeed",
          strategy,
          url,
          response: response.data,
        },
      });
    }

    const lhr = response.data.lighthouseResult;
    const audits = lhr.audits;

    return {
      score: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
      lcp: parseFloat(audits["largest-contentful-paint"]?.numericValue ?? "0"),
      fid: parseFloat(audits["max-potential-fid"]?.numericValue ?? "0"),
      cls: parseFloat(audits["cumulative-layout-shift"]?.numericValue ?? "0"),
      fcp: parseFloat(audits["first-contentful-paint"]?.numericValue ?? "0"),
      ttfb: parseFloat(audits["server-response-time"]?.numericValue ?? "0"),
      tti: parseFloat(audits["interactive"]?.numericValue ?? "0"),
      tbt: parseFloat(audits["total-blocking-time"]?.numericValue ?? "0"),
      speedIndex: parseFloat(audits["speed-index"]?.numericValue ?? "0"),
    };
  } catch {
    return { score: 0, lcp: 0, fid: 0, cls: 0, fcp: 0, ttfb: 0, tti: 0, tbt: 0, speedIndex: 0 };
  }
}

// ---------------------------------------------------------------------------
// HTML Crawl
// ---------------------------------------------------------------------------

interface CrawlResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  isHttps: boolean;
  responseTime: number;
  redirectCount: number;
  hasGzip: boolean;
  hasBrotli: boolean;
  serverHeader?: string;
}

async function crawlWebsite(url: string): Promise<CrawlResult> {
  const start = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LocalSEOAudit/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, br",
      },
      validateStatus: () => true,
    });

    const responseTime = Date.now() - start;
    const finalUrl = response.request?.res?.responseUrl || url;
    const encoding = response.headers["content-encoding"] || "";

    return {
      html: typeof response.data === "string" ? response.data : "",
      finalUrl,
      statusCode: response.status,
      isHttps: finalUrl.startsWith("https://"),
      responseTime,
      redirectCount: (response.request?.res?.req?._redirectable?._redirectCount) ?? 0,
      hasGzip: encoding.includes("gzip"),
      hasBrotli: encoding.includes("br"),
      serverHeader: response.headers["server"],
    };
  } catch {
    return {
      html: "",
      finalUrl: url,
      statusCode: 0,
      isHttps: url.startsWith("https://"),
      responseTime: Date.now() - start,
      redirectCount: 0,
      hasGzip: false,
      hasBrotli: false,
    };
  }
}

function parseOnPage(html: string, url: string): OnPageData {
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const h1Tags = $("h1").map((_, el) => $(el).text().trim()).get();
  const h2Tags = $("h2").map((_, el) => $(el).text().trim()).get();
  const images = $("img");
  const imagesWithAlt = images.filter((_, el) => !!$(el).attr("alt")).length;
  const internalLinks = $("a[href]").filter((_, el) => {
    const href = $(el).attr("href") || "";
    return href.startsWith("/") || href.includes(new URL(url).hostname);
  }).length;
  const externalLinks = $("a[href]").filter((_, el) => {
    const href = $(el).attr("href") || "";
    return href.startsWith("http") && !href.includes(new URL(url).hostname);
  }).length;

  const canonical = $('link[rel="canonical"]').attr("href") || "";
  const robotsMeta = $('meta[name="robots"]').attr("content") || "";

  return {
    title,
    titleLength: title.length,
    hasKeywordInTitle: false, // Set later by caller with keyword context
    metaDescription: metaDesc,
    metaDescriptionLength: metaDesc.length,
    h1Count: h1Tags.length,
    h1Text: h1Tags,
    h2Count: h2Tags.length,
    h2Text: h2Tags.slice(0, 10),
    imageCount: images.length,
    imagesWithAlt,
    imagesWithoutAlt: images.length - imagesWithAlt,
    internalLinks,
    externalLinks,
    wordCount: $("body").text().split(/\s+/).filter(Boolean).length,
    hasCanonical: !!canonical,
    canonicalUrl: canonical,
    hasRobotsMeta: !!robotsMeta,
    robotsContent: robotsMeta,
    hasOpenGraph: !!$('meta[property="og:title"]').length,
    hasTwitterCard: !!$('meta[name="twitter:card"]').length,
    hasViewport: !!$('meta[name="viewport"]').length,
    hasCharset: !!$('meta[charset]').length || !!$('meta[http-equiv="Content-Type"]').length,
    langAttribute: $("html").attr("lang") || "",
  };
}

function parseSchema(html: string): SchemaData {
  const $ = cheerio.load(html);
  const jsonLdScripts = $('script[type="application/ld+json"]');

  if (jsonLdScripts.length === 0) {
    return {
      hasSchema: false, types: [], hasLocalBusiness: false, hasOrganization: false,
      hasProduct: false, hasReview: false, hasBreadcrumb: false, hasFAQ: false,
      markupMethod: "none",
    };
  }

  const types: string[] = [];
  let extractedData: Record<string, unknown> = {};

  jsonLdScripts.each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item["@type"]) {
          const t = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
          types.push(...t);
        }
        extractedData = { ...extractedData, ...item };
      }
    } catch {
      // Invalid JSON-LD
    }
  });

  const LOCAL_BIZ_TYPES = ["LocalBusiness", "Dentist", "Restaurant", "Store", "MedicalBusiness", "LegalService"];

  return {
    hasSchema: true,
    types,
    hasLocalBusiness: types.some((t) => LOCAL_BIZ_TYPES.includes(t)),
    hasOrganization: types.includes("Organization"),
    hasProduct: types.includes("Product"),
    hasReview: types.includes("Review") || types.includes("AggregateRating"),
    hasBreadcrumb: types.includes("BreadcrumbList"),
    hasFAQ: types.includes("FAQPage"),
    extractedData,
    markupMethod: "json-ld",
  };
}

// ---------------------------------------------------------------------------
// NAP Consistency
// ---------------------------------------------------------------------------

function checkNAPConsistency(
  html: string,
  schema: SchemaData,
  canonicalNAP: NAPData
): NAPAuditData {
  const $ = cheerio.load(html);
  const bodyText = $("body").text();

  // Try schema first, then scan HTML
  const nameOnSite =
    (schema.extractedData?.["name"] as string) ||
    findTextMatch(bodyText, canonicalNAP.name);
  const phoneOnSite =
    (schema.extractedData?.["telephone"] as string) ||
    findPhoneInText(bodyText);
  const addressOnSite =
    extractSchemaAddress(schema.extractedData) ||
    findTextMatch(bodyText, canonicalNAP.address);

  const normalisePhone = (p: string) => p.replace(/\D/g, "").slice(-10);

  const nameMatch = !!nameOnSite && canonicalNAP.name.toLowerCase().includes(nameOnSite.toLowerCase().substring(0, 10));
  const phoneMatch = !!phoneOnSite && normalisePhone(phoneOnSite) === normalisePhone(canonicalNAP.phone);
  const addressMatch = !!addressOnSite && canonicalNAP.address.toLowerCase().includes(
    addressOnSite.toLowerCase().split(",")[0]?.trim() || ""
  );

  let napScore = 0;
  if (nameMatch) napScore += 6;
  if (addressMatch) napScore += 7;
  if (phoneMatch) napScore += 7;

  return { nameOnSite, addressOnSite, phoneOnSite, nameMatch, addressMatch, phoneMatch, napScore };
}

function findTextMatch(text: string, target: string): string | undefined {
  if (!target) return undefined;
  const idx = text.toLowerCase().indexOf(target.toLowerCase().substring(0, 15));
  if (idx === -1) return undefined;
  return text.substring(idx, idx + target.length + 20).trim();
}

function findPhoneInText(text: string): string | undefined {
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{4}/;
  const match = text.match(phoneRegex);
  return match?.[0];
}

function extractSchemaAddress(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const addr = data["address"] as Record<string, string> | undefined;
  if (!addr) return undefined;
  return [addr["streetAddress"], addr["addressLocality"], addr["addressRegion"]]
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Technical Checks
// ---------------------------------------------------------------------------

async function checkTechnical(url: string, crawl: CrawlResult): Promise<TechnicalData> {
  let hasSitemap = false;
  let sitemapUrl: string | undefined;
  let hasRobotsTxt = false;
  let robotsTxtUrl: string | undefined;

  const origin = new URL(url).origin;

  try {
    const sitemapRes = await axios.head(`${origin}/sitemap.xml`, { timeout: 3000, validateStatus: () => true });
    hasSitemap = sitemapRes.status === 200;
    if (hasSitemap) sitemapUrl = `${origin}/sitemap.xml`;
  } catch { /* ignore */ }

  try {
    const robotsRes = await axios.head(`${origin}/robots.txt`, { timeout: 3000, validateStatus: () => true });
    hasRobotsTxt = robotsRes.status === 200;
    if (hasRobotsTxt) robotsTxtUrl = `${origin}/robots.txt`;
  } catch { /* ignore */ }

  const $ = cheerio.load(crawl.html);
  const hasViewport = !!$('meta[name="viewport"]').length;

  return {
    isHttps: crawl.isHttps,
    hasWwwRedirect: crawl.finalUrl.includes("www."),
    hasHttpToHttpsRedirect: !url.startsWith("https") && crawl.isHttps,
    hasSitemap,
    sitemapUrl,
    hasRobotsTxt,
    robotsTxtUrl,
    hasMobileFriendly: hasViewport,
    hasAmpVersion: false,
    responseTime: crawl.responseTime,
    statusCode: crawl.statusCode,
    hasGzip: crawl.hasGzip,
    hasBrotli: crawl.hasBrotli,
    serverHeader: crawl.serverHeader,
  };
}

// ---------------------------------------------------------------------------
// Backlink Data (Moz)
// ---------------------------------------------------------------------------

async function fetchBacklinks(url: string): Promise<BacklinkData> {
  const accessId = process.env.MOZ_ACCESS_ID;
  const secretKey = process.env.MOZ_SECRET_KEY;

  if (!accessId || !secretKey) {
    return {
      domainAuthority: 0,
      pageAuthority: 0,
      linkingDomains: 0,
      totalLinks: 0,
      spamScore: 0,
      error: "MOZ credentials not configured",
    };
  }

  try {
    const response = await axios.post(
      "https://lsapi.seomoz.com/v2/url_metrics",
      {
        targets: [new URL(url).origin],
        metrics: ["domain_authority", "page_authority", "spam_score", "root_domains_to_root_domain"],
      },
      {
        auth: { username: accessId, password: secretKey },
        timeout: 10000,
      }
    );

    const data = response.data?.results?.[0];
    return {
      domainAuthority: data?.domain_authority ?? 0,
      pageAuthority: data?.page_authority ?? 0,
      linkingDomains: data?.root_domains_to_root_domain ?? 0,
      totalLinks: 0,
      spamScore: data?.spam_score ?? 0,
    };
  } catch {
    return {
      domainAuthority: 0,
      pageAuthority: 0,
      linkingDomains: 0,
      totalLinks: 0,
      spamScore: 0,
      error: "Moz API call failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full website audit against the provided URL.
 */
export async function auditWebsite(
  url: string,
  canonicalNAP: NAPData,
  debug?: { uuid: string }
): Promise<WebsiteAuditResult> {
  // Run crawl and PSI in parallel
  const [crawl, mobile, desktop, backlinks] = await Promise.all([
    crawlWebsite(url),
    runPageSpeedInsights(url, "mobile", debug),
    runPageSpeedInsights(url, "desktop", debug),
    fetchBacklinks(url),
  ]);

  if (debug?.uuid) {
    await persistTestingJson({
      uuid: debug.uuid,
      category: "website",
      name: "crawl-metadata",
      data: {
        url,
        finalUrl: crawl.finalUrl,
        statusCode: crawl.statusCode,
        isHttps: crawl.isHttps,
        responseTime: crawl.responseTime,
        redirectCount: crawl.redirectCount,
        hasGzip: crawl.hasGzip,
        hasBrotli: crawl.hasBrotli,
        serverHeader: crawl.serverHeader,
        htmlLength: crawl.html.length,
      },
    });
    await persistTestingText({
      uuid: debug.uuid,
      category: "website",
      name: "crawl-html",
      text: crawl.html,
      ext: "html",
    });
  }

  const performance: PageSpeedData = { mobile, desktop };
  const onPage = parseOnPage(crawl.html, url);
  const schema = parseSchema(crawl.html);
  const nap = checkNAPConsistency(crawl.html, schema, canonicalNAP);
  const technical = await checkTechnical(url, crawl);

  // Compute website SEO score inline (avoids circular import with scorer)
  const perfScore = (mobile.score / 100) * 25;
  let onPageScore = 0;
  if (onPage.h1Count === 1) onPageScore += 4;
  if (onPage.hasCanonical) onPageScore += 5;
  if (schema.hasLocalBusiness) onPageScore += 6;
  if (onPage.metaDescriptionLength >= 120 && onPage.metaDescriptionLength <= 160) onPageScore += 3;
  if (onPage.internalLinks >= 3) onPageScore += 3;
  onPageScore = Math.min(25, onPageScore);
  const napScore = nap.napScore;
  let techScore = 0;
  if (technical.isHttps) techScore += 6;
  if (technical.hasMobileFriendly) techScore += 5;
  if (technical.hasSitemap) techScore += 3;
  if (technical.hasRobotsTxt) techScore += 3;
  if (technical.statusCode === 200) techScore += 3;
  techScore = Math.min(20, techScore);
  let blScore = backlinks.domainAuthority >= 40 ? 6 : backlinks.domainAuthority >= 20 ? 3 : 1;
  if (backlinks.spamScore < 5) blScore += 4;
  else if (backlinks.spamScore <= 30) blScore += 2;
  blScore = Math.min(10, blScore);

  const score = Math.min(100, Math.round(perfScore + onPageScore + napScore + techScore + blScore));

  return {
    url,
    finalUrl: crawl.finalUrl,
    isHttps: crawl.isHttps,
    hasWwwRedirect: crawl.finalUrl.includes("www."),
    performance,
    onPage,
    nap,
    technical,
    schema,
    backlinks,
    score,
  };
}
