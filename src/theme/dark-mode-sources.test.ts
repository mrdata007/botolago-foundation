import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BG-0149 — dark mode is on, so two colour mistakes that only show in dark
 * must not come back anywhere in the product, not just inside the UI kit
 * (which has its own, stricter contract test).
 *
 *   1. `--ui-ink` as a foreground. It is a dark navy in BOTH themes — a fill
 *      and border colour. As text, a ring, an outline, an SVG stroke or fill,
 *      or a form control's accent it measured 1.25–1.42:1 on dark (BG-0083).
 *      The foreground is `--ui-ink-fg`, equal to `--ui-ink` in light. Until
 *      BG-0149 only the kit was scanned, which is how the link button, its
 *      focus ring, the vice-captain rings, an admin ring, the unread dot and
 *      the checkbox accent slipped through.
 *   2. `--brand-primary` as a colour. It is the V1 navy with no dark value
 *      (the admin chart's hovered bar measured 1.35:1 on dark). Kit tokens
 *      carry the theme.
 *
 * Scanned as source text, because these are Tailwind class strings: nothing
 * at runtime can observe them. Comments are removed first, so prose that
 * names the rule does not trip it.
 */

const ROOT = join(import.meta.dir, "..", "..");
const KIT = join("src", "components", "ui-kit");

const sources = readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
  .map((entry) => join("src", entry))
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .filter((file) => !file.startsWith(KIT + "/"))
  .sort();

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const code = (file: string) => stripComments(readFileSync(join(ROOT, file), "utf8"));

/** `text-[color:var(--ui-ink)]`, `ring-[var(--ui-ink)]`, `accent-(--ui-ink)` … */
const INK_AS_FOREGROUND =
  /\b(?:text|ring|outline|stroke|fill|accent|caret|decoration|placeholder)-(?:\[(?:color:)?var\(--ui-ink\)\]|\((?:color:)?--ui-ink\))/g;

describe("dark mode: colour sources outside the kit", () => {
  it("scans the product, not an empty list", () => {
    expect(sources.length).toBeGreaterThan(300);
    expect(sources).toContain("src/components/ui/button.tsx");
    expect(sources.some((file) => file.startsWith(KIT))).toBe(false);
  });

  it("never uses the ink fill (--ui-ink) as text, ring, outline, stroke, fill or accent", () => {
    const offenders = sources.flatMap((file) =>
      [...code(file).matchAll(INK_AS_FOREGROUND)].map((match) => `${file}: ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("never paints with --brand-primary", () => {
    const offenders = sources.filter((file) => /--brand-primary\b/.test(code(file)));
    expect(offenders).toEqual([]);
  });

  it("the patterns catch what they are for", () => {
    const hits = (sample: string) => [...sample.matchAll(INK_AS_FOREGROUND)].length;
    expect(hits('"focus-visible:ring-[color:var(--ui-ink)]"')).toBe(1);
    expect(hits('"text-[color:var(--ui-ink)] accent-[color:var(--ui-ink)]"')).toBe(2);
    expect(hits('"stroke-(--ui-ink) fill-[var(--ui-ink)]"')).toBe(2);
    // The fill itself, and the foreground token, are fine.
    expect(hits('"bg-[color:var(--ui-ink)] text-[color:var(--ui-ink-fg)]"')).toBe(0);
    expect(hits('"ring-[color:var(--ui-ink-fg)] border-[color:var(--ui-ink)]"')).toBe(0);
  });
});
