import { mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

export interface AuditOptions {
  sitemap: string;
  maxUrls: number;
  concurrency: number;
  output: string;
  timeoutMs: number;
}

export interface AuditRow {
  url: string;
  status: number;
  redirect: string;
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  h1Count: number;
  canonical: string;
  robots: string;
  wordCount: number;
  language: string;
  jsonLdTypes: string;
  responseMs: number;
  issues: string[];
}

const DEFAULTS: AuditOptions = {
  sitemap: "https://botolago.com/sitemap.xml",
  // A safe recurring sample. Pass --max=0 for the complete sitemap.
  maxUrls: 200,
  concurrency: 4,
  output: "seo-audit.csv",
  timeoutMs: 20_000,
};

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITY_MAP[entity.toLowerCase()] ?? whole;
  });
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    found.set(match[1]!.toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return found;
}

function tagWithAttribute(
  html: string,
  tagName: string,
  name: string,
  value: string,
): Map<string, string> | null {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const attrs = attributes(match[0]);
    if (attrs.get(name)?.toLowerCase() === value.toLowerCase()) return attrs;
  }
  return null;
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function isUtilityPage(url: string): boolean {
  return /\/(?:privacy|terms|prizes(?:\/terms)?|auth|profile|unsubscribe)(?:[/?#]|$)/.test(url);
}

function jsonLdTypes(html: string): string[] {
  const types: string[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(match[1]!);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (typeof entry?.["@type"] === "string") types.push(entry["@type"]);
        if (Array.isArray(entry?.["@graph"])) {
          for (const graphEntry of entry["@graph"]) {
            if (typeof graphEntry?.["@type"] === "string") types.push(graphEntry["@type"]);
          }
        }
      }
    } catch {
      types.push("INVALID");
    }
  }
  return types;
}

export function inspectHtml(
  url: string,
  status: number,
  redirect: string,
  html: string,
  responseMs: number,
): AuditRow {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description =
    tagWithAttribute(html, "meta", "name", "description")?.get("content")?.trim() ?? "";
  const canonical = tagWithAttribute(html, "link", "rel", "canonical")?.get("href")?.trim() ?? "";
  const robots = tagWithAttribute(html, "meta", "name", "robots")?.get("content")?.trim() ?? "";
  const language = attributes(html.match(/<html\b[^>]*>/i)?.[0] ?? "").get("lang") ?? "";
  const h1Count = html.match(/<h1\b/gi)?.length ?? 0;
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const visible = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ");
  const wordCount = cleanText(visible).split(/\s+/).filter(Boolean).length;
  const issues: string[] = [];

  if (status !== 200) issues.push(`http_${status}`);
  if (!title) issues.push("missing_title");
  else {
    if (title.length < 30) issues.push("short_title");
    if (title.length > 60) issues.push("long_title");
  }
  if (!description) issues.push("missing_description");
  else if (description.length > 155) issues.push("long_description");
  if (h1Count === 0) issues.push("missing_h1");
  if (h1Count > 1) issues.push("multiple_h1");
  if (!canonical) issues.push("missing_canonical");
  else if (canonicalUrl(canonical) !== canonicalUrl(url)) issues.push("canonical_mismatch");
  if (/\bnoindex\b/i.test(robots)) issues.push("noindex");
  if (wordCount < 300 && !isUtilityPage(url)) issues.push("thin_raw_html");

  return {
    url,
    status,
    redirect,
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    h1Count,
    canonical,
    robots,
    wordCount,
    language,
    jsonLdTypes: jsonLdTypes(html).join("|"),
    responseMs,
    issues,
  };
}

function xmlLocs(xml: string, container: "url" | "sitemap"): string[] {
  const entries = new RegExp(`<${container}\\b[^>]*>([\\s\\S]*?)</${container}>`, "gi");
  const urls: string[] = [];
  for (const entry of xml.matchAll(entries)) {
    const loc = entry[1]?.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
    if (loc) urls.push(decodeEntities(loc.trim()));
  }
  return urls;
}

async function fetchText(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "BotolaGO-SEO-Audit/1.0 (+https://botolago.com)" },
  });
}

async function sitemapUrls(sitemap: string, timeoutMs: number): Promise<string[]> {
  const pending = [sitemap];
  const visited = new Set<string>();
  const urls: string[] = [];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (visited.size > 100) throw new Error("Sitemap index exceeded the 100-file safety limit.");
    const response = await fetchText(current, timeoutMs);
    if (!response.ok) throw new Error(`${current} returned HTTP ${response.status}`);
    const xml = await response.text();
    if (/<sitemapindex\b/i.test(xml)) pending.push(...xmlLocs(xml, "sitemap"));
    else if (/<urlset\b/i.test(xml)) urls.push(...xmlLocs(xml, "url"));
    else throw new Error(`${current} is neither a sitemap index nor a URL set.`);
  }
  return [...new Set(urls)];
}

async function auditUrl(url: string, timeoutMs: number): Promise<AuditRow> {
  const started = performance.now();
  try {
    const response = await fetchText(url, timeoutMs);
    const html = await response.text();
    return inspectHtml(
      url,
      response.status,
      response.headers.get("location") ?? "",
      html,
      Math.round(performance.now() - started),
    );
  } catch (error) {
    return {
      url,
      status: 0,
      redirect: "",
      title: "",
      titleLength: 0,
      description: "",
      descriptionLength: 0,
      h1Count: 0,
      canonical: "",
      robots: "",
      wordCount: 0,
      language: "",
      jsonLdTypes: "",
      responseMs: Math.round(performance.now() - started),
      issues: [`fetch_error:${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function pool<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

function csv(value: unknown): string {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: readonly AuditRow[]): string {
  const columns: Array<keyof AuditRow> = [
    "url",
    "status",
    "redirect",
    "title",
    "titleLength",
    "description",
    "descriptionLength",
    "h1Count",
    "canonical",
    "robots",
    "wordCount",
    "language",
    "jsonLdTypes",
    "responseMs",
    "issues",
  ];
  return (
    [
      columns.map(csv).join(","),
      ...rows.map((row) => columns.map((key) => csv(row[key])).join(",")),
    ].join("\n") + "\n"
  );
}

function duplicateIssues(rows: AuditRow[]): void {
  for (const [field, issue] of [
    ["title", "duplicate_title"],
    ["description", "duplicate_description"],
  ] as const) {
    const groups = new Map<string, AuditRow[]>();
    for (const row of rows) {
      const value = row[field].trim().toLocaleLowerCase();
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), row]);
    }
    for (const group of groups.values()) {
      if (group.length > 1) for (const row of group) row.issues.push(issue);
    }
  }
}

function parseArgs(argv: readonly string[]): AuditOptions {
  const options = { ...DEFAULTS };
  for (const argument of argv) {
    const [name, value] = argument.split("=", 2);
    if (name === "--sitemap" && value) options.sitemap = value;
    else if (name === "--max" && value !== undefined) options.maxUrls = Number(value);
    else if (name === "--concurrency" && value) options.concurrency = Number(value);
    else if (name === "--output" && value) options.output = value;
    else if (name === "--timeout-ms" && value) options.timeoutMs = Number(value);
    else if (name === "--help") {
      console.log(
        "bun scripts/seo/audit-site.ts [--sitemap=URL] [--max=200|0] [--concurrency=4] [--output=seo-audit.csv] [--timeout-ms=20000]",
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  for (const [name, value] of [
    ["max", options.maxUrls],
    ["concurrency", options.concurrency],
    ["timeout-ms", options.timeoutMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || (name !== "max" && value < 1)) {
      throw new Error(`--${name} has an invalid value.`);
    }
  }
  return options;
}

function summary(rows: readonly AuditRow[], discovered: number, options: AuditOptions) {
  const issueCounts = new Map<string, number>();
  for (const row of rows) {
    for (const issue of row.issues) issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
  }
  return {
    sitemap: options.sitemap,
    discoveredUrls: discovered,
    auditedUrls: rows.length,
    generatedAt: new Date().toISOString(),
    issueCounts: Object.fromEntries([...issueCounts].sort((a, b) => b[1] - a[1])),
    averageResponseMs:
      rows.length === 0
        ? 0
        : Math.round(rows.reduce((total, row) => total + row.responseMs, 0) / rows.length),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const discovered = await sitemapUrls(options.sitemap, options.timeoutMs);
  const selected = options.maxUrls === 0 ? discovered : discovered.slice(0, options.maxUrls);
  const rows = await pool(selected, options.concurrency, (url) => auditUrl(url, options.timeoutMs));
  duplicateIssues(rows);

  const output = resolve(options.output);
  const summaryOutput = output.slice(0, output.length - extname(output).length) + ".summary.json";
  await mkdir(dirname(output), { recursive: true });
  await Bun.write(output, toCsv(rows));
  const report = summary(rows, discovered.length, options);
  await Bun.write(summaryOutput, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ ...report, output, summaryOutput }, null, 2));
}

if (import.meta.main) await main();
