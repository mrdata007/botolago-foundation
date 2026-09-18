/**
 * BG-0014 — localization gate for the fr/ar dictionaries.
 *
 * WHAT THIS IS
 * ------------
 * `auditI18n()` is a pure function over (dictionaries, usage index, allow-lists,
 * baselines). The CLI wrapper at the bottom builds the real inputs, prints a
 * report and exits 1 when anything fails. It has no dependencies beyond
 * `bun:test`-free standard Bun APIs (`Bun.Glob`, `Bun.file`).
 *
 * ERRORS (always fail the gate)
 * -----------------------------
 *   E1  key present in one language only
 *   E2  empty / whitespace-only value
 *   E3  placeholder-token set differs between fr and ar
 *   E4  unbalanced or repeated {accent}…{/accent} span
 *   E5  literal t("…") key absent from the dictionary
 *   E6  stale allow-list entry (allow-listed key no longer in the dictionary)
 *
 * WARNINGS (ratcheted against committed baselines)
 * ------------------------------------------------
 *   W1  keys whose fr and ar values are identical
 *   W2  ar values containing no Arabic script
 *   W3  dictionary keys not referenced anywhere in src/
 *   W4  t() call sites whose argument is not a literal key (enumerable template
 *       prefixes and fully opaque expressions alike)
 *
 * Warnings are counted over the whole dictionary; the allow-lists do not change
 * a count, they annotate it — an allow-listed finding is printed as `suppressed`
 * with its justification, an unlisted one is printed by name. That is what keeps
 * `profile.title` (English copy with trailing newlines, repaired separately by
 * BG-0024) visible in the report instead of silently absorbed.
 *
 * THE BASELINES ARE EXACT-EQUALITY ON PURPOSE. A count that goes *up* is new
 * drift; a count that goes *down* means the committed baseline is stale and must
 * be lowered in the same commit that improved it. Either way the gate fails and
 * a human edits `BASELINES` below. This friction is the feature — see the
 * BG-0014 EngineeringBrief, `risks`.
 *
 * W3 is static analysis over source text. It is a *reporting* signal only:
 * never wire it to key deletion. A key can be reachable through a runtime
 * expression that no regex can see (that is exactly what W4 counts).
 *
 * Usage:
 *   bun scripts/qa/i18n-gate.ts             audit the real dictionaries
 *   bun scripts/qa/i18n-gate.ts --fixture   audit the deliberately broken fixture
 */

import { dictionaries } from "../../src/i18n/dictionaries";
import { IDENTICAL_ALLOWED, NO_ARABIC_SCRIPT_ALLOWED } from "../../src/i18n/i18n-allowlist";
import {
  brokenDictionaries,
  BROKEN_FIXTURE_BASELINES,
} from "../../src/i18n/__fixtures__/broken-dictionary";

/* ------------------------------------------------------------------ types */

export type GateLanguage = "fr" | "ar";

export type GateDictionaries = Record<GateLanguage, Record<string, string>>;

export interface UsageIndex {
  /** key used as a literal `t("key")` argument -> the sites that do so. */
  literalKeys: Map<string, string[]>;
  /** static prefix of a `t(`prefix.${…}`)` argument -> the sites that do so. */
  templatePrefixes: Map<string, string[]>;
  /** `t(…)` call sites whose argument is neither literal nor a usable prefix. */
  opaqueSites: string[];
  /** every quoted string literal seen in the scanned sources. */
  quotedStrings: Set<string>;
}

export interface AllowLists {
  identical: Readonly<Record<string, string>>;
  noArabicScript: Readonly<Record<string, string>>;
}

export type WarningCode = "W1" | "W2" | "W3" | "W4";

export type Baselines = Record<WarningCode, number>;

export interface Finding {
  code: "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | WarningCode;
  key: string;
  message: string;
}

export interface WarningGroup {
  code: WarningCode;
  label: string;
  count: number;
  baseline: number;
  /** findings with no allow-list entry — printed by name. */
  reported: Finding[];
  /** findings with an allow-list entry — printed with their justification. */
  suppressed: Finding[];
}

export interface AuditResult {
  errors: Finding[];
  warnings: WarningGroup[];
  baselineViolations: Finding[];
  ok: boolean;
}

/* ------------------------------------------------------- committed baselines */

/**
 * Measured on the tree at BG-0014. Changing any of these numbers is a deliberate,
 * reviewed act: state in the commit message why the count moved.
 */
export const BASELINES: Baselines = {
  W1: 6,
  W2: 5,
  W3: 237,
  W4: 100,
};

export const LANGUAGES: GateLanguage[] = ["fr", "ar"];

/** Arabic, Arabic Supplement, Extended-A and the presentation forms. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const ACCENT_OPEN = "{accent}";
const ACCENT_CLOSE = "{/accent}";

/* --------------------------------------------------------------- pure audit */

/** Placeholder tokens such as `{n}` or `{name}`; the {accent} markup is E4's job. */
export function placeholderTokens(value: string): string[] {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (match[1] !== "accent") tokens.add(match[1]);
  }
  return [...tokens].sort();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export function emptyUsageIndex(): UsageIndex {
  return {
    literalKeys: new Map(),
    templatePrefixes: new Map(),
    opaqueSites: [],
    quotedStrings: new Set(),
  };
}

function isReachable(key: string, usage: UsageIndex): boolean {
  if (usage.quotedStrings.has(key)) return true;
  if (usage.literalKeys.has(key)) return true;
  for (const prefix of usage.templatePrefixes.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * The gate proper. Pure: no filesystem, no process, no clock.
 */
export function auditI18n(
  dicts: GateDictionaries,
  usage: UsageIndex,
  allow: AllowLists,
  baselines: Baselines = BASELINES,
): AuditResult {
  const errors: Finding[] = [];

  const fr = dicts.fr;
  const ar = dicts.ar;
  const allKeys = [...new Set([...Object.keys(fr), ...Object.keys(ar)])].sort();

  // E1 — one-sided keys.
  for (const key of allKeys) {
    const inFr = Object.prototype.hasOwnProperty.call(fr, key);
    const inAr = Object.prototype.hasOwnProperty.call(ar, key);
    if (inFr && !inAr) {
      errors.push({ code: "E1", key, message: `present in fr but missing from ar` });
    } else if (inAr && !inFr) {
      errors.push({ code: "E1", key, message: `present in ar but missing from fr` });
    }
  }

  // E2 — empty or whitespace-only values.
  for (const lang of LANGUAGES) {
    for (const [key, value] of Object.entries(dicts[lang])) {
      if (value.trim().length === 0) {
        errors.push({ code: "E2", key, message: `${lang} value is empty or whitespace-only` });
      }
    }
  }

  // E3 — placeholder parity, for keys present in both languages.
  for (const key of allKeys) {
    if (fr[key] === undefined || ar[key] === undefined) continue;
    const frTokens = placeholderTokens(fr[key]);
    const arTokens = placeholderTokens(ar[key]);
    if (frTokens.join("|") !== arTokens.join("|")) {
      errors.push({
        code: "E3",
        key,
        message: `placeholder tokens differ: fr {${frTokens.join(", ")}} vs ar {${arTokens.join(", ")}}`,
      });
    }
  }

  // E4 — {accent} spans: balanced, and at most one per value (the Trans renderer
  // resolves only the first span).
  for (const lang of LANGUAGES) {
    for (const [key, value] of Object.entries(dicts[lang])) {
      const open = countOccurrences(value, ACCENT_OPEN);
      const close = countOccurrences(value, ACCENT_CLOSE);
      if (open !== close) {
        errors.push({
          code: "E4",
          key,
          message: `${lang} value has ${open} {accent} and ${close} {/accent}`,
        });
      } else if (open > 1) {
        errors.push({
          code: "E4",
          key,
          message: `${lang} value has ${open} {accent} spans; only the first is rendered`,
        });
      }
    }
  }

  // E5 — literal t("…") keys that do not resolve.
  for (const [key, sites] of [...usage.literalKeys].sort(([a], [b]) => a.localeCompare(b))) {
    if (fr[key] === undefined && ar[key] === undefined) {
      errors.push({
        code: "E5",
        key,
        message: `t("${key}") resolves to no dictionary entry (${sites[0]}${sites.length > 1 ? ` +${sites.length - 1} more` : ""})`,
      });
    }
  }

  // E6 — stale allow-list entries.
  for (const [name, list] of [
    ["IDENTICAL_ALLOWED", allow.identical],
    ["NO_ARABIC_SCRIPT_ALLOWED", allow.noArabicScript],
  ] as const) {
    for (const key of Object.keys(list)) {
      if (fr[key] === undefined && ar[key] === undefined) {
        errors.push({ code: "E6", key, message: `${name} entry is not a dictionary key` });
      }
    }
  }

  // W1 — identical fr/ar values.
  const w1: WarningGroup = {
    code: "W1",
    label: "keys whose fr and ar values are identical",
    count: 0,
    baseline: baselines.W1,
    reported: [],
    suppressed: [],
  };
  for (const key of allKeys) {
    if (fr[key] === undefined || ar[key] === undefined) continue;
    if (fr[key] !== ar[key]) continue;
    w1.count += 1;
    const justification = allow.identical[key];
    const finding: Finding = {
      code: "W1",
      key,
      message: justification ?? `fr and ar are both ${JSON.stringify(fr[key])}`,
    };
    (justification ? w1.suppressed : w1.reported).push(finding);
  }

  // W2 — ar values with no Arabic script.
  const w2: WarningGroup = {
    code: "W2",
    label: "ar values containing no Arabic script",
    count: 0,
    baseline: baselines.W2,
    reported: [],
    suppressed: [],
  };
  for (const key of Object.keys(ar).sort()) {
    if (ARABIC_SCRIPT.test(ar[key])) continue;
    w2.count += 1;
    const justification = allow.noArabicScript[key];
    const finding: Finding = {
      code: "W2",
      key,
      message: justification ?? `ar value is ${JSON.stringify(ar[key])}`,
    };
    (justification ? w2.suppressed : w2.reported).push(finding);
  }

  // W3 — keys not referenced anywhere in the scanned sources.
  const w3: WarningGroup = {
    code: "W3",
    label: "dictionary keys not referenced anywhere in src/",
    count: 0,
    baseline: baselines.W3,
    reported: [],
    suppressed: [],
  };
  for (const key of Object.keys(fr).sort()) {
    if (isReachable(key, usage)) continue;
    w3.count += 1;
    w3.reported.push({ code: "W3", key, message: "no literal, prefix or quoted reference" });
  }

  // W4 — t() call sites whose argument is not a literal key. Enumerable template
  // prefixes are counted too: the gate can list the keys such a call *might*
  // reach, but not which one it does reach at runtime.
  const nonLiteral: Finding[] = [];
  for (const [prefix, sites] of usage.templatePrefixes) {
    for (const site of sites) {
      nonLiteral.push({ code: "W4", key: site, message: `template prefix \`${prefix}\`` });
    }
  }
  for (const site of usage.opaqueSites) {
    nonLiteral.push({ code: "W4", key: site, message: "opaque expression" });
  }
  nonLiteral.sort((a, b) => a.key.localeCompare(b.key));
  const w4: WarningGroup = {
    code: "W4",
    label: "t() call sites whose argument is not a literal key",
    count: nonLiteral.length,
    baseline: baselines.W4,
    reported: nonLiteral,
    suppressed: [],
  };

  const warnings = [w1, w2, w3, w4];
  const baselineViolations: Finding[] = warnings
    .filter((group) => group.count !== group.baseline)
    .map((group) => ({
      code: group.code,
      key: group.code,
      message: `${group.label}: ${group.count} != committed baseline ${group.baseline} — review the change and update BASELINES in scripts/qa/i18n-gate.ts`,
    }));

  return {
    errors,
    warnings,
    baselineViolations,
    ok: errors.length === 0 && baselineViolations.length === 0,
  };
}

/* --------------------------------------------------------------- usage index */

const SINGLE_LINE_STRING = /(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1/g;
const SIMPLE_TEMPLATE = /`([^`\\$\r\n]*)`/g;

/** Slice the argument list of a `t(` call, tracking quotes and nesting. */
function sliceCallArgument(source: string, openParenIndex: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

/**
 * Classify a `t(…)` argument. A template literal counts as statically
 * enumerable only when its leading static chunk ends in "." or "_", i.e. it
 * names a dictionary namespace rather than an arbitrary fragment.
 */
export function classifyArgument(
  raw: string,
): { kind: "literal"; value: string } | { kind: "prefix"; value: string } | { kind: "opaque" } {
  const arg = raw.trim();
  const quoted = /^(["'])((?:\\.|(?!\1)[^\\\r\n])*)\1$/.exec(arg);
  if (quoted) return { kind: "literal", value: quoted[2] };

  if (arg.startsWith("`")) {
    const plain = /^`([^`\\$\r\n]*)`$/.exec(arg);
    if (plain) return { kind: "literal", value: plain[1] };
    const withExpression = /^`([^`\\$\r\n]*)\$\{/.exec(arg);
    if (withExpression) {
      const prefix = withExpression[1];
      if (prefix.endsWith(".") || prefix.endsWith("_")) return { kind: "prefix", value: prefix };
    }
  }
  return { kind: "opaque" };
}

/** Index one source file into `index`. Exported so the test can drive it. */
export function indexSource(index: UsageIndex, file: string, source: string): void {
  for (const match of source.matchAll(SINGLE_LINE_STRING)) {
    index.quotedStrings.add(match[2]);
  }
  for (const match of source.matchAll(SIMPLE_TEMPLATE)) {
    index.quotedStrings.add(match[1]);
  }

  for (const match of source.matchAll(/\bt\(/g)) {
    const openParenIndex = match.index + match[0].length - 1;
    const raw = sliceCallArgument(source, openParenIndex);
    if (raw === null) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const site = `${file}:${line}`;
    const classified = classifyArgument(raw);
    if (classified.kind === "literal") {
      const sites = index.literalKeys.get(classified.value) ?? [];
      sites.push(site);
      index.literalKeys.set(classified.value, sites);
    } else if (classified.kind === "prefix") {
      const sites = index.templatePrefixes.get(classified.value) ?? [];
      sites.push(site);
      index.templatePrefixes.set(classified.value, sites);
    } else {
      index.opaqueSites.push(site);
    }
  }
}

/**
 * Scan `root` for TypeScript sources. The i18n module itself is excluded: the
 * dictionaries, the allow-list and the broken fixture declare keys, they do not
 * consume them, and counting them would make every key trivially reachable.
 */
export async function buildUsageIndex(root = "src"): Promise<UsageIndex> {
  const index = emptyUsageIndex();
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const files: string[] = [];
  for await (const relative of glob.scan({ cwd: root })) {
    if (relative.startsWith("i18n/")) continue;
    files.push(relative);
  }
  files.sort();
  for (const relative of files) {
    const path = `${root}/${relative}`;
    indexSource(index, path, await Bun.file(path).text());
  }
  return index;
}

export const ALLOW_LISTS: AllowLists = {
  identical: IDENTICAL_ALLOWED,
  noArabicScript: NO_ARABIC_SCRIPT_ALLOWED,
};

/* ----------------------------------------------------------------- reporting */

export function formatReport(result: AuditResult): string {
  const lines: string[] = [];
  lines.push("i18n gate");
  lines.push("=========");
  lines.push("");

  if (result.errors.length === 0) {
    lines.push("errors: none");
  } else {
    lines.push(`errors: ${result.errors.length}`);
    for (const finding of result.errors) {
      lines.push(`  ${finding.code} ${finding.key} — ${finding.message}`);
    }
  }
  lines.push("");

  for (const group of result.warnings) {
    const verdict = group.count === group.baseline ? "at baseline" : "BASELINE MISMATCH";
    lines.push(
      `${group.code} ${group.label}: ${group.count} (baseline ${group.baseline}) ${verdict}`,
    );
    for (const finding of group.reported.slice(0, 20)) {
      lines.push(`  - ${finding.key} — ${finding.message}`);
    }
    if (group.reported.length > 20) {
      lines.push(`  - … ${group.reported.length - 20} more`);
    }
    for (const finding of group.suppressed) {
      lines.push(`  · ${finding.key} — suppressed: ${finding.message}`);
    }
    lines.push("");
  }

  if (result.baselineViolations.length > 0) {
    lines.push("baseline violations:");
    for (const finding of result.baselineViolations) {
      lines.push(`  ${finding.code} — ${finding.message}`);
    }
    lines.push("");
  }

  lines.push(result.ok ? "RESULT: pass" : "RESULT: fail");
  return lines.join("\n");
}

/* ----------------------------------------------------------------------- CLI */

export async function runCli(argv: string[]): Promise<number> {
  const fixtureMode = argv.includes("--fixture");
  const result = fixtureMode
    ? auditI18n(
        brokenDictionaries,
        emptyUsageIndex(),
        { identical: {}, noArabicScript: {} },
        BROKEN_FIXTURE_BASELINES,
      )
    : auditI18n(
        dictionaries as unknown as GateDictionaries,
        await buildUsageIndex("src"),
        ALLOW_LISTS,
      );
  console.log(fixtureMode ? "(fixture mode: auditing the deliberately broken fixture)" : "");
  console.log(formatReport(result));
  return result.ok ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
