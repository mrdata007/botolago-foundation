import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lint for the BotolaGO+ stylesheets (docs/product/botolago-plus-polish-brief.md).
 *
 * - spacing and box sizes sit on the 4px grid, except the optical allowlist below;
 * - every box-shadow is a token, every border-radius is a token (or 0 / 50%);
 * - every animation runs only inside `prefers-reduced-motion: no-preference`, and a transition
 *   outside it needs a `prefers-reduced-motion: reduce` block that switches it off;
 * - every `--po-*` / `--ps-*` custom property that is read is defined somewhere.
 */

const DIR = import.meta.dir;
const FILES = readdirSync(DIR)
  .filter((f) => /^plus.*\.css$/.test(f))
  .sort();

type Decl = { prop: string; value: string; ctx: string[] };

function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Declarations with the chain of at-rules / selectors they sit in. */
function parse(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: string[] = [];
  let buf = "";
  let paren = 0;
  const flush = () => {
    const m = /^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*$/.exec(buf);
    if (m) out.push({ prop: m[1]!, value: m[2]!.replace(/\s+/g, " "), ctx: [...stack] });
    buf = "";
  };
  for (const ch of css) {
    if (ch === "(") paren++;
    if (ch === ")") paren--;
    if (paren === 0 && ch === "{") {
      stack.push(buf.trim().replace(/\s+/g, " "));
      buf = "";
    } else if (paren === 0 && ch === "}") {
      flush();
      stack.pop();
    } else if (paren === 0 && ch === ";") flush();
    else buf += ch;
  }
  return out;
}

const SPACING =
  /^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-width|min-height|max-width|max-height|inline-size|block-size|min-inline-size|min-block-size|max-inline-size|max-block-size|flex-basis|outline-offset|border-spacing|(padding|margin|inset|scroll-margin|scroll-padding)-[a-z-]+)$/;

/** The only off-grid spacing values: hairline-level shapes and half-width centring (brief). */
const ALLOW: { prop: RegExp; value: RegExp; why: string }[] = [
  { prop: /^(inline|block)-size$/, value: /^2px$/, why: "a 2px rule or marker is a hairline" },
  {
    prop: /^inline-size$/,
    value: /^calc\(\(100% - 2px\) \/ var\(--n, 4\)\)$/,
    why: "the tab pill sits 1px inside its track on each side",
  },
  {
    prop: /^margin-inline-start$/,
    value: /^-2px$/,
    why: "centres a 4px marker on its x position",
  },
];

function pxValues(value: string): number[] {
  const out: number[] = [];
  for (const m of value.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem)\b/g)) {
    out.push(parseFloat(m[1]!) * (m[2] === "rem" ? 16 : 1));
  }
  return out;
}

const files = FILES.map((name) => {
  const css = strip(readFileSync(join(DIR, name), "utf8"));
  return { name, css, decls: parse(css) };
});

describe("the BotolaGO+ stylesheets", () => {
  it("are found", () => {
    expect(FILES).toEqual(
      expect.arrayContaining(["plus-embed.css", "plus-season.css", "plus-tokens.css", "plus.css"]),
    );
  });

  it("keep spacing and box sizes on the 4px grid", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const d of f.decls) {
        if (d.prop.startsWith("--") || !SPACING.test(d.prop)) continue;
        if (ALLOW.some((a) => a.prop.test(d.prop) && a.value.test(d.value))) continue;
        for (const px of pxValues(d.value)) {
          if (Math.abs(px) > 1 && Math.abs(px) % 4 !== 0)
            bad.push(`${f.name}: ${d.prop}: ${d.value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("use a spacing token for padding, margin and gap steps that have one", () => {
    const tokens = new Map<number, string>();
    for (const m of files
      .find((f) => f.name === "plus-tokens.css")!
      .css.matchAll(/--po-space-(\d+):\s*(\d+)px/g)) {
      tokens.set(Number(m[2]), m[1]!);
    }
    const bad: string[] = [];
    for (const f of files) {
      for (const d of f.decls) {
        if (!/^(padding|margin|gap|row-gap|column-gap|inset)(-[a-z-]+)?$/.test(d.prop)) continue;
        for (const m of d.value.matchAll(/(?<![\w.-])(\d+)px\b/g)) {
          if (tokens.has(Number(m[1]))) bad.push(`${f.name}: ${d.prop}: ${d.value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("use a token for every box-shadow", () => {
    const ok =
      /^(none|inherit|initial|unset|var\(--po-(shadow|glow|ring|halo)[-\w]*\)(, ?var\(--po-(shadow|glow|ring|halo)[-\w]*\))*)$/;
    const bad: string[] = [];
    for (const f of files) {
      if (f.name === "plus-tokens.css") continue;
      for (const d of f.decls) {
        if (d.prop === "box-shadow" && !ok.test(d.value)) bad.push(`${f.name}: ${d.value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("use a token for every border-radius", () => {
    const part = "(0|50%|inherit|var\\(--po-radius-(xs|sm|md|lg|pill|panel)\\))";
    const ok = new RegExp(`^${part}( ${part}){0,3}$`);
    const bad: string[] = [];
    for (const f of files) {
      for (const d of f.decls) {
        if (
          /^border(-(start|end|top|bottom)-(start|end|left|right))?-radius$/.test(d.prop) &&
          !ok.test(d.value)
        ) {
          bad.push(`${f.name}: ${d.prop}: ${d.value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("run every animation only where motion is allowed", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const d of f.decls) {
        if (!/^animation(-name)?$/.test(d.prop) || /^none\b/.test(d.value)) continue;
        if (d.ctx.some((c) => c.startsWith("@keyframes"))) continue;
        const guarded = d.ctx.some((c) =>
          /^@media[^{]*\(prefers-reduced-motion: no-preference\)/.test(c),
        );
        if (!guarded) bad.push(`${f.name}: ${d.ctx.join(" > ")} { ${d.prop}: ${d.value} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("switch off any transition that runs outside the motion guard", () => {
    const bad: string[] = [];
    for (const f of files) {
      const hasReduce = f.decls.some(
        (d) =>
          d.ctx.some((c) => /prefers-reduced-motion: reduce/.test(c)) &&
          /^(transition|animation)$/.test(d.prop) &&
          d.value === "none",
      );
      for (const d of f.decls) {
        if (!/^transition(-property)?$/.test(d.prop) || /^(none|0s)\b/.test(d.value)) continue;
        const guarded = d.ctx.some((c) => /\(prefers-reduced-motion: no-preference\)/.test(c));
        const inReduce = d.ctx.some((c) => /prefers-reduced-motion: reduce/.test(c));
        if (!guarded && !inReduce && !hasReduce)
          bad.push(`${f.name}: ${d.ctx.join(" > ")} { ${d.value} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("only transform and opacity move in the micro-interactions", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const d of f.decls) {
        if (d.prop !== "transition") continue;
        if (!d.ctx.some((c) => /\(prefers-reduced-motion: no-preference\)/.test(c))) continue;
        for (const part of d.value.split(",")) {
          const name = part.trim().split(" ")[0]!;
          if (!["transform", "opacity", "box-shadow", "color", "visibility"].includes(name)) {
            bad.push(`${f.name}: ${d.value}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("only read custom properties that some plus stylesheet defines", () => {
    const defined = new Set<string>();
    for (const f of files)
      for (const m of f.css.matchAll(/(--(?:po|ps)-[\w-]+)\s*:/g)) defined.add(m[1]!);
    const missing = new Set<string>();
    for (const f of files) {
      for (const m of f.css.matchAll(/var\((--(?:po|ps)-[\w-]+)\s*[,)]/g)) {
        if (!defined.has(m[1]!)) missing.add(`${f.name}: ${m[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
