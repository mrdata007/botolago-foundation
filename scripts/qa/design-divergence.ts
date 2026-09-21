#!/usr/bin/env bun
/**
 * BG-0089 — design divergence meter.
 *
 * Counts, per file, how far the source diverges from the UI kit
 * (`src/components/ui-kit/`), which carries the Fantasy visual language that
 * the owner has made the product-wide source of truth.
 *
 * Comments and import specifiers are stripped before counting: a previous
 * lane inflated its own numbers by counting explanatory prose that documents
 * the very patterns it was removing.
 *
 * Usage:
 *   bun scripts/qa/design-divergence.ts            # table, worst first
 *   bun scripts/qa/design-divergence.ts --json     # machine-readable
 *   bun scripts/qa/design-divergence.ts --top 40
 *   bun scripts/qa/design-divergence.ts --baseline b.json  # diff vs baseline
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");

/** Files that legitimately contain the vocabulary: the kit itself, and tests. */
const EXEMPT = [
  /^src\/components\/ui-kit\//,
  /\.test\.tsx?$/,
  /^src\/backend\//,
  /^src\/services\//,
  /^src\/mocks\//,
  /^src\/types\//,
];

type Rule = { id: string; label: string; re: RegExp };

const RULES: Rule[] = [
  {
    id: "radiusV2",
    label: "v2 radii (rounded-lg/xl/2xl/3xl)",
    re: /\brounded-(?:[strebl]{1,2}-)?(?:lg|xl|2xl|3xl)\b/g,
  },
  {
    id: "legacySurface",
    label: "glass-*/surface-N/--glass-border/cta-brand/press-tile",
    re: /\b(?:glass-[a-z-]+|surface-\d+|cta-brand|press-tile)\b|--glass-border/g,
  },
  {
    id: "typeRamp",
    label: "Tailwind type ramp (text-xs…4xl)",
    re: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)\b/g,
  },
  { id: "shadow", label: "shadow-sm/md", re: /\bshadow-(?:sm|md)\b/g },
  {
    id: "tracking",
    label: "tracking-* without ltr:",
    re: /(?<!ltr:)\btracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])/g,
  },
  {
    id: "hardColour",
    label: "hardcoded colours (hex/rgb/bg-white/named palette)",
    re: /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b|\brgba?\(|\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline|decoration|divide|accent|caret|placeholder)-(?:white|black|(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g,
  },
  {
    id: "physicalDir",
    label: "physical direction utilities",
    re: /\b(?:ml|mr|pl|pr)-(?:\d+(?:\.\d+)?|px|auto|\[[^\]]+\])\b|\b(?:left|right)-(?:\d+(?:\.\d+)?|px|auto|full|\[[^\]]+\])\b|\btext-(?:left|right)\b|\bborder-[lr]\b|\brounded-(?:tl|tr|bl|br|l|r)-/g,
  },
  { id: "fpl", label: "--fpl-* / fpl- usage", re: /--fpl-[a-z0-9-]+/g },
];

/** Strip block/line comments and import statements without touching JSX text. */
function strip(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  let quote: string | null = null;
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (quote) {
      if (c === "\\") {
        out += "  ";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k += 1) out += source[k] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "{" && source.startsWith("{/*", i)) {
      const end = source.indexOf("*/}", i);
      const stop = end === -1 ? n : end + 3;
      for (let k = i; k < stop; k += 1) out += source[k] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  // Drop import/export-from specifiers so module paths never score.
  return out.replace(/^\s*(?:import|export)[^\n;]*?from\s*["'][^"']*["'];?/gm, "");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts|css)$/.test(entry)) acc.push(full);
  }
  return acc;
}

export type FileScore = {
  file: string;
  total: number;
  counts: Record<string, number>;
};

export function measure(): FileScore[] {
  const rows: FileScore[] = [];
  for (const full of walk(SRC)) {
    const file = relative(ROOT, full);
    if (EXEMPT.some((re) => re.test(file))) continue;
    const body = strip(readFileSync(full, "utf8"));
    const counts: Record<string, number> = {};
    let total = 0;
    for (const rule of RULES) {
      const m = body.match(rule.re);
      const c = m ? m.length : 0;
      if (c) counts[rule.id] = c;
      total += c;
    }
    if (total) rows.push({ file, total, counts });
  }
  return rows.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  const rows = measure();
  if (argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const topIdx = argv.indexOf("--top");
    const top = topIdx === -1 ? 30 : Number(argv[topIdx + 1]);
    const perRule: Record<string, number> = {};
    for (const r of rows)
      for (const [k, v] of Object.entries(r.counts)) perRule[k] = (perRule[k] ?? 0) + v;
    const grand = rows.reduce((s, r) => s + r.total, 0);

    console.log(`files with divergences: ${rows.length}`);
    console.log(`total divergences:      ${grand}\n`);
    console.log("by rule:");
    for (const rule of RULES) {
      console.log(`  ${String(perRule[rule.id] ?? 0).padStart(5)}  ${rule.label}`);
    }
    console.log(`\nworst ${Math.min(top, rows.length)} files:`);
    for (const r of rows.slice(0, top)) {
      const detail = Object.entries(r.counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      console.log(`  ${String(r.total).padStart(4)}  ${r.file}\n        ${detail}`);
    }
  }
}
