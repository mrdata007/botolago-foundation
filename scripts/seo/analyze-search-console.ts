import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

type CsvRecord = Record<string, string>;

interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  page?: string;
}

interface Options {
  queries?: string;
  queryPages?: string;
  pages?: string;
  previousPages?: string;
  outputDir: string;
}

const HEADER_ALIASES = {
  query: ["query", "queries", "requete", "requetes", "top queries"],
  page: ["page", "pages", "landing page", "url"],
  clicks: ["clicks", "clics"],
  impressions: ["impressions"],
  ctr: ["ctr", "click through rate", "taux de clics"],
  position: ["position", "average position", "position moyenne"],
} as const;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function delimiterOf(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (character: string) => first.split(character).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

export function parseCsv(text: string): CsvRecord[] {
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map(normalizeHeader);
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

function field(record: CsvRecord, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = record[normalizeHeader(alias)];
    if (value !== undefined) return value;
  }
  return "";
}

function numberValue(value: string): number {
  const cleaned = value.replace(/[\s\u00a0]/g, "").replace(/,(?=\d+$)/, ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ctrValue(value: string): number {
  const parsed = numberValue(value.replace("%", ""));
  return value.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

function gscRows(records: readonly CsvRecord[], dimension: "query" | "page"): GscRow[] {
  const aliases = HEADER_ALIASES[dimension];
  return records.flatMap((record) => {
    const key = field(record, aliases).trim();
    if (!key) return [];
    return [
      {
        key,
        clicks: numberValue(field(record, HEADER_ALIASES.clicks)),
        impressions: numberValue(field(record, HEADER_ALIASES.impressions)),
        ctr: ctrValue(field(record, HEADER_ALIASES.ctr)),
        position: numberValue(field(record, HEADER_ALIASES.position)),
        ...(dimension === "query"
          ? { page: field(record, HEADER_ALIASES.page).trim() || undefined }
          : {}),
      },
    ];
  });
}

async function readRows(path: string, dimension: "query" | "page"): Promise<GscRow[]> {
  const file = Bun.file(resolve(path));
  if (!(await file.exists())) throw new Error(`File not found: ${path}`);
  return gscRows(parseCsv(await file.text()), dimension);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function positionBucket(position: number): "1" | "2-3" | "4-5" | null {
  if (position <= 0) return null;
  if (position > 0 && position < 1.5) return "1";
  if (position <= 3.5) return "2-3";
  if (position <= 5.5) return "4-5";
  return null;
}

function csv(value: unknown): string {
  const text = typeof value === "number" ? String(value) : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function tableCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]!);
  return (
    [
      columns.map(csv).join(","),
      ...rows.map((row) => columns.map((column) => csv(row[column])).join(",")),
    ].join("\n") + "\n"
  );
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { outputDir: "seo-gsc-output" };
  for (const argument of argv) {
    const [name, value] = argument.split("=", 2);
    if (name === "--queries" && value) options.queries = value;
    else if (name === "--query-pages" && value) options.queryPages = value;
    else if (name === "--pages" && value) options.pages = value;
    else if (name === "--previous-pages" && value) options.previousPages = value;
    else if (name === "--output-dir" && value) options.outputDir = value;
    else if (name === "--help") {
      console.log(
        [
          "bun scripts/seo/analyze-search-console.ts \\",
          "  --queries=Queries.csv \\",
          "  [--query-pages=QueryPages.csv] \\",
          "  [--pages=Pages.csv] [--previous-pages=PagesPrevious.csv] \\",
          "  [--output-dir=seo-gsc-output]",
        ].join("\n"),
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.queries && !options.pages) {
    throw new Error("Provide at least --queries or --pages.");
  }
  if (options.previousPages && !options.pages) {
    throw new Error("--previous-pages requires --pages.");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const generated: string[] = [];
  const counts: Record<string, number> = {};

  if (options.queries) {
    const queries = await readRows(options.queries, "query");
    const queryPages = options.queryPages ? await readRows(options.queryPages, "query") : [];
    const bestPage = new Map<string, GscRow>();
    for (const row of queryPages) {
      const current = bestPage.get(row.key);
      if (!current || row.impressions > current.impressions) bestPage.set(row.key, row);
    }
    const striking = queries
      .filter((row) => row.position >= 8 && row.position <= 20 && row.impressions >= 100)
      .sort((a, b) => b.impressions - a.impressions)
      .map((row) => ({
        query: row.key,
        page: bestPage.get(row.key)?.page ?? row.page ?? "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        action:
          bestPage.has(row.key) || row.page
            ? "Check intent, add the missing answer, then add two relevant internal links."
            : "Export Search Console with both query and page dimensions before choosing the landing page.",
      }));
    const path = `${outputDir}/striking-distance.csv`;
    await Bun.write(path, tableCsv(striking));
    generated.push(path);
    counts.strikingDistance = striking.length;
  }

  if (options.pages) {
    const pages = await readRows(options.pages, "page");
    const eligible = pages.filter((row) => row.impressions >= 100 && positionBucket(row.position));
    const baselines = new Map<string, number>();
    for (const bucket of ["1", "2-3", "4-5"] as const) {
      baselines.set(
        bucket,
        median(
          eligible.filter((row) => positionBucket(row.position) === bucket).map((row) => row.ctr),
        ),
      );
    }
    const lowCtr = eligible
      .filter((row) => {
        const baseline = baselines.get(positionBucket(row.position)!) ?? 0;
        return baseline > 0 && row.ctr < baseline * 0.7;
      })
      .sort((a, b) => b.impressions - a.impressions)
      .map((row) => ({
        page: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        peer_median_ctr: Number((baselines.get(positionBucket(row.position)!) ?? 0).toFixed(4)),
        action: "Rewrite the title and description to match the ranking query and page promise.",
      }));
    const lowCtrPath = `${outputDir}/low-ctr-pages.csv`;
    await Bun.write(lowCtrPath, tableCsv(lowCtr));
    generated.push(lowCtrPath);
    counts.lowCtrPages = lowCtr.length;

    if (options.previousPages) {
      const previous = new Map(
        (await readRows(options.previousPages, "page")).map((row) => [row.key, row]),
      );
      const decay = pages
        .flatMap((row) => {
          const before = previous.get(row.key);
          if (!before || before.clicks <= 0) return [];
          const loss = (before.clicks - row.clicks) / before.clicks;
          return loss > 0.3 ? [{ row, before, loss }] : [];
        })
        .sort((a, b) => b.loss - a.loss)
        .map(({ row, before, loss }) => ({
          page: row.key,
          current_clicks: row.clicks,
          previous_clicks: before.clicks,
          click_loss: Number(loss.toFixed(4)),
          current_impressions: row.impressions,
          previous_impressions: before.impressions,
          current_position: Number(row.position.toFixed(2)),
          previous_position: Number(before.position.toFixed(2)),
          checks:
            "Freshness; stronger competitor; intent shift; cannibalization; AI answer visibility.",
        }));
      const decayPath = `${outputDir}/content-decay.csv`;
      await Bun.write(decayPath, tableCsv(decay));
      generated.push(decayPath);
      counts.contentDecay = decay.length;
    }
  }

  const report = { generatedAt: new Date().toISOString(), counts, files: generated };
  const summaryPath = `${outputDir}/summary.json`;
  await Bun.write(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, summary: summaryPath }, null, 2));
}

if (import.meta.main) await main();
