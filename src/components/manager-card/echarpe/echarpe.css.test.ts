import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./echarpe.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Splits CSS into top-level blocks: [prelude, body]. */
function blocks(src: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      if (depth === 0) prelude = src.slice(start, i).trim();
      depth++;
      if (depth === 1) start = i + 1;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push([prelude, src.slice(start, i)]);
        start = i + 1;
      }
    }
  }
  return out;
}

const top = blocks(css);
const media = top.filter(([p]) => p.startsWith("@media"));
const keyframes = top.filter(([p]) => p.startsWith("@keyframes"));
const rules = top.filter(([p]) => !p.startsWith("@"));

describe("echarpe.css", () => {
  it("every rule is under the renderer's own classes", () => {
    const all = [...rules, ...media.flatMap(([, body]) => blocks(body))];
    expect(all.length).toBeGreaterThan(20);
    for (const [selectors] of all)
      for (const sel of selectors.split(",").map((s) => s.trim()))
        expect(sel).toMatch(/^\.mc-(echarpe|tk)\b/);
  });

  it("every custom property and keyframe is the renderer's own", () => {
    for (const [prelude] of keyframes) expect(prelude).toMatch(/^@keyframes mc-[a-z0-9-]+$/);
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) expect(m[1]).toMatch(/^--mc-/);
  });

  it("nothing animates outside no-preference: reduced motion has no animation at all", () => {
    expect(media.length).toBe(1);
    expect(media[0][0]).toBe("@media (prefers-reduced-motion: no-preference)");
    const outside = [...rules, ...keyframes.map(([p]) => [p, ""] as [string, string])]
      .map(([, body]) => body)
      .join("\n");
    expect(outside).not.toMatch(/animation/);
    expect(outside).not.toMatch(/transition/);
    // and every animation the card runs is declared inside it
    const inside = media[0][1];
    for (const name of [
      "mc-stitch",
      "mc-stitch-rtl",
      "mc-knit",
      "mc-knit-rtl",
      "mc-year",
      "mc-swing",
      "mc-drop",
      "mc-arms",
      "mc-fists",
    ])
      expect(inside + keyframes.map(([p]) => p).join(" ")).toContain(name);
  });

  it("the stitch reveal is a clip-path stepped in whole stitches, never an opacity or a slide", () => {
    for (const name of ["mc-stitch", "mc-stitch-rtl", "mc-knit", "mc-knit-rtl"]) {
      const body = keyframes.find(([p]) => p === `@keyframes ${name}`)?.[1] ?? "";
      expect(body).toContain("clip-path: inset(");
      expect(body).not.toMatch(/opacity|transform|filter|blur/);
    }
    const stitch = keyframes.find(([p]) => p === "@keyframes mc-stitch")?.[1] ?? "";
    expect(stitch).toContain("steps(26, end)");
    expect(stitch).toContain("steps(10, end)");
    expect(keyframes.find(([p]) => p === "@keyframes mc-knit-rtl")?.[1]).toContain(
      "inset(0 0 0 100%)",
    );
    // the whole-row beats read the reading side: the Arabic scarf knits from the right
    expect(media[0][1]).toContain('.mc-echarpe[dir="rtl"] .mc-kr');
  });

  it("the plan's timings: the tier beat, the legend beat, the year", () => {
    const m = media[0][1];
    expect(m).toContain("mc-swing 520ms cubic-bezier(0.3, 0.7, 0.3, 1) 80ms both");
    expect(m).toContain("mc-drop 240ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both");
    expect(m).toContain("mc-arms 420ms cubic-bezier(0.2, 0.9, 0.25, 1) both");
    expect(m).toContain("mc-fists 420ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both");
    expect(m).toContain("mc-year 120ms linear 480ms both");
    const swing = keyframes.find(([p]) => p === "@keyframes mc-swing")?.[1] ?? "";
    expect(swing).toContain("skewX(5deg)");
    expect(swing).toContain("skewX(-2deg)");
    const drop = keyframes.find(([p]) => p === "@keyframes mc-drop")?.[1] ?? "";
    expect(drop).toContain("translateY(-8px)");
    const arms = keyframes.find(([p]) => p === "@keyframes mc-arms")?.[1] ?? "";
    expect(arms).toContain("translateY(18px)");
    expect(arms).toContain("opacity: 0.4");
    const fists = keyframes.find(([p]) => p === "@keyframes mc-fists")?.[1] ?? "";
    expect(fists).toContain("translateY(12px) scaleY(0.96)");
  });

  it("no letter-spacing on Arabic text, and the patch figures are tabular", () => {
    const ar = rules.find(([p]) => p === ".mc-echarpe .mc-pt-ar")?.[1] ?? "";
    expect(ar).toContain("letter-spacing: 0");
    expect(rules.find(([p]) => p === ".mc-echarpe .mc-pt-v")?.[1]).toContain("tabular-nums");
  });

  it("the card reads its theme from its own class, never from the page", () => {
    expect(css).not.toMatch(/\.dark\b|\.app-dark|\.app-light|data-ground|prefers-color-scheme/);
  });
});
