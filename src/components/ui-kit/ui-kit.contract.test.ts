import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { UI_DERIVED_TOKENS, UI_THEMED_TOKENS, UI_TOKENS, ui } from "./tokens";

/**
 * The UI kit is the layer every other screen is converted against, so a
 * defect introduced here is a defect introduced product-wide. Five classes of
 * defect have shipped in this codebase before and none of them failed a
 * typecheck or a lint:
 *
 *   1. Physical direction utilities (`ml-`, `pr-`, `text-left`, `border-l`,
 *      `left-`), and physical gradient angles (`135deg` lands on the
 *      opposite edge in Arabic). They look correct in French and silently
 *      break Arabic.
 *   2. Letter-spacing applied to Arabic (`tracking-*` with no `ltr:`
 *      prefix). Arabic letterforms join; spacing them apart in either
 *      direction breaks the word. This is the open defect BG-0069 and the
 *      kit must not reproduce it.
 *   3. Hardcoded colours (`bg-white`, `text-black`, `#rrggbb`,
 *      `text-white`). They pin one theme and make dark mode unreachable.
 *   4. A fill colour used as a foreground. `--ui-ink` is a dark navy in
 *      BOTH themes and measured 1.25:1 as text on dark (BG-0083). Text is
 *      `--ui-ink-fg`.
 *   5. Two token systems. `--fpl-*` was a light-only palette beside the
 *      kit; it is now an alias layer and is pinned as one here, so it can
 *      never drift back into a second system.
 *
 * The kit is scanned as source text, because these are Tailwind class
 * strings: nothing at runtime can observe them.
 */

const KIT_DIR = import.meta.dir;
const ROOT = join(KIT_DIR, "..", "..", "..");
const CSS_PATH = join(ROOT, "src", "styles.css");
const css = readFileSync(CSS_PATH, "utf8");

const kitFiles = readdirSync(KIT_DIR)
  .filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))
  .sort();

/** Strip comments so the rules above, written in prose, are not themselves matched. */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (name: string) => stripComments(readFileSync(join(KIT_DIR, name), "utf8"));

/** Every `{ … }` body of a rule whose selector matches, brace-balanced. */
function cssBlocks(selector: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`(^|[\\s}])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let index = re.lastIndex;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(re.lastIndex, index - 1));
  }
  return blocks;
}

/** `--token: value;` pairs declared anywhere in a block, value brace/paren safe. */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    let depth = 0;
    let index = re.lastIndex;
    while (index < block.length) {
      const char = block[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      else if (char === ";" && depth === 0) break;
      index += 1;
    }
    found.set(match[1], block.slice(re.lastIndex, index).trim());
  }
  return found;
}

const rootDeclarations = cssBlocks(":root").reduce((all, block) => {
  for (const [token, value] of declarations(block)) all.set(token, value);
  return all;
}, new Map<string, string>());

const darkDeclarations = cssBlocks(".dark").reduce((all, block) => {
  for (const [token, value] of declarations(block)) all.set(token, value);
  return all;
}, new Map<string, string>());

describe("ui-kit: the kit exists and is non-trivial", () => {
  it("ships tokens, primitives and a barrel", () => {
    expect(kitFiles).toContain("tokens.ts");
    expect(kitFiles).toContain("primitives.tsx");
    expect(kitFiles).toContain("index.ts");
  });
});

describe("ui-kit: direction safety", () => {
  // Each pattern is paired with the logical utility that replaces it, so a
  // failure tells the author what to write instead.
  const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp; use: string }> = [
    { name: "ml-*", re: /(^|[\s"'`{])-?ml-[\w.[\]/-]+/m, use: "ms-*" },
    { name: "mr-*", re: /(^|[\s"'`{])-?mr-[\w.[\]/-]+/m, use: "me-*" },
    { name: "pl-*", re: /(^|[\s"'`{])-?pl-[\w.[\]/-]+/m, use: "ps-*" },
    { name: "pr-*", re: /(^|[\s"'`{])-?pr-[\w.[\]/-]+/m, use: "pe-*" },
    { name: "left-*", re: /(^|[\s"'`{])-?left-[\w.[\]/-]+/m, use: "start-*" },
    { name: "right-*", re: /(^|[\s"'`{])-?right-[\w.[\]/-]+/m, use: "end-*" },
    { name: "text-left", re: /\btext-left\b/m, use: "text-start" },
    { name: "text-right", re: /\btext-right\b/m, use: "text-end" },
    { name: "border-l", re: /\bborder-l(-[\w.[\]/-]+)?(?![\w-])/m, use: "border-s" },
    { name: "border-r", re: /\bborder-r(-[\w.[\]/-]+)?(?![\w-])/m, use: "border-e" },
    { name: "rounded-l", re: /\brounded-l(-[\w.[\]/-]+)?(?![\w-])/m, use: "rounded-s" },
    { name: "rounded-r", re: /\brounded-r(-[\w.[\]/-]+)?(?![\w-])/m, use: "rounded-e" },
    { name: "margin-left/right (CSS)", re: /\bmargin-(left|right)\b/m, use: "margin-inline-*" },
    { name: "padding-left/right (CSS)", re: /\bpadding-(left|right)\b/m, use: "padding-inline-*" },
    {
      name: "a deg angle in a gradient",
      re: /(linear|conic)-gradient\([^)]*\d+deg/m,
      use: "to bottom (a deg angle is physical and mirrors wrong in Arabic)",
    },
  ];

  for (const file of kitFiles) {
    for (const { name, re, use } of FORBIDDEN) {
      it(`${file} uses no ${name} (use ${use})`, () => {
        const match = read(file).match(re);
        expect(match?.[0] ?? null).toBeNull();
      });
    }
  }

  it("no --ui-* gradient token carries a physical angle", () => {
    const offenders = [...rootDeclarations, ...darkDeclarations]
      .filter(([token]) => token.startsWith("--ui-grad-"))
      .filter(([, value]) => /(linear|conic)-gradient\([^)]*\d+deg/.test(value))
      .map(([token]) => token);
    expect(offenders).toEqual([]);
  });
});

describe("ui-kit: never letter-space Arabic (BG-0069)", () => {
  for (const file of kitFiles) {
    it(`${file} prefixes every tracking-* with ltr:`, () => {
      const code = read(file);
      // Every occurrence of `tracking-` must be immediately preceded by `ltr:`.
      const offenders = [...code.matchAll(/(.{0,4})tracking-[\w[\]./-]+/g)]
        .filter((m) => !m[1].endsWith("ltr:"))
        .map((m) => m[0].trim());
      expect(offenders).toEqual([]);
    });

    it(`${file} sets no raw letter-spacing`, () => {
      expect(read(file)).not.toMatch(/letter-spacing\s*:/);
    });
  }
});

describe("ui-kit: theme correctness", () => {
  for (const file of kitFiles) {
    it(`${file} hardcodes no colour literal`, () => {
      const code = read(file);
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code).not.toMatch(/\brgba?\(/);
      // `bg-white` / `text-black` etc. pin one theme. Colours come from
      // `--ui-*` or `currentColor`.
      expect(code).not.toMatch(/\b(bg|text|border|ring|fill|stroke)-(white|black)\b/);
    });

    it(`${file} uses --ui-ink for fills only, never as a foreground (BG-0083)`, () => {
      const offenders = [
        ...read(file).matchAll(
          /(?:text|placeholder|ring|caret|decoration)-\[color:var\(--ui-ink\)\]/g,
        ),
      ].map((m) => m[0]);
      expect(offenders).toEqual([]);
    });

    it(`${file} reaches for no --fpl-* token`, () => {
      // The Fantasy names are an alias layer for un-converted screens. The
      // kit is the thing they alias INTO, so it never points back at them.
      expect(read(file)).not.toMatch(/--fpl-[a-z]/);
    });
  }

  it("every colour-bearing token is redeclared for dark mode", () => {
    const missing = UI_THEMED_TOKENS.filter((token) => !darkDeclarations.has(token));
    expect(missing).toEqual([]);
  });

  it("a derived token is composed only of themed tokens, so it follows the theme", () => {
    for (const token of UI_DERIVED_TOKENS) {
      const value = rootDeclarations.get(token);
      expect(value).toBeDefined();
      const referenced = [...(value ?? "").matchAll(/var\((--ui-[a-z0-9-]+)\)/g)].map((m) => m[1]);
      expect(referenced.length).toBeGreaterThan(0);
      for (const reference of referenced) {
        expect(UI_THEMED_TOKENS as readonly string[]).toContain(reference);
      }
      // …and nothing else: a literal colour inside it would be light-only.
      expect(value).not.toMatch(/oklch|oklab|#[0-9a-f]{3}|rgba?\(/i);
    }
  });

  it("no colour-bearing --ui-* token is left without a dark story", () => {
    const carriesColour = (value: string) =>
      /oklch\(|oklab\(|color-mix\(|linear-gradient\(|radial-gradient\(|var\(--brand-/.test(value);
    const accounted = new Set<string>([...UI_THEMED_TOKENS, ...UI_DERIVED_TOKENS]);
    const orphans = [...rootDeclarations]
      .filter(([token, value]) => token.startsWith("--ui-") && carriesColour(value))
      .map(([token]) => token)
      .filter((token) => !accounted.has(token));
    expect(orphans).toEqual([]);
  });
});

describe("ui-kit: the token manifest matches the stylesheet", () => {
  it("declares every token the manifest names", () => {
    const missing = UI_TOKENS.filter((token) => !rootDeclarations.has(token));
    expect(missing).toEqual([]);
  });

  it("names every --ui-* token the stylesheet declares", () => {
    const declared = new Set(
      [...rootDeclarations.keys(), ...darkDeclarations.keys()].filter((token) =>
        token.startsWith("--ui-"),
      ),
    );
    const unlisted = [...declared].filter(
      (token) => !(UI_TOKENS as readonly string[]).includes(token),
    );
    expect(unlisted).toEqual([]);
  });

  it("lists every themed and derived token in the manifest", () => {
    for (const token of [...UI_THEMED_TOKENS, ...UI_DERIVED_TOKENS]) {
      expect(UI_TOKENS as readonly string[]).toContain(token);
    }
  });

  it("references only tokens that exist", () => {
    for (const file of kitFiles) {
      const used = [...read(file).matchAll(/var\((--ui-[a-z0-9-]+)/g)].map((match) => match[1]);
      for (const token of used) {
        expect(UI_TOKENS as readonly string[]).toContain(token);
      }
    }
  });
});

describe("ui-kit: one system — --fpl-* is an alias layer (BG-0091)", () => {
  const fplDeclarations = [...rootDeclarations].filter(([token]) => token.startsWith("--fpl-"));

  it("still declares the Fantasy names, so un-converted screens keep working", () => {
    expect(fplDeclarations.length).toBeGreaterThan(15);
  });

  it("gives every Fantasy token a value that is exactly one --ui-* token", () => {
    const offenders = fplDeclarations
      .filter(([, value]) => !/^var\(--ui-[a-z0-9-]+\)$/.test(value))
      .map(([token, value]) => `${token}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it("points every Fantasy token at a token the manifest names", () => {
    for (const [, value] of fplDeclarations) {
      const target = value.replace(/^var\(|\)$/g, "");
      expect(UI_TOKENS as readonly string[]).toContain(target);
    }
  });

  it("redeclares no Fantasy token under .dark — the alias carries the theme", () => {
    const offenders = [...darkDeclarations.keys()].filter((token) => token.startsWith("--fpl-"));
    expect(offenders).toEqual([]);
  });
});

describe("ui-kit: one scale of each kind", () => {
  const valuesOf = (prefix: string) =>
    [...rootDeclarations]
      .filter(([token]) => token.startsWith(prefix))
      .map(([token, value]) => [token, value.replace(/\s*\/\*[\s\S]*$/, "").trim()] as const);

  for (const [name, prefix] of [
    ["type ramp", "--ui-text-"],
    ["stat ramp", "--ui-stat-"],
    ["display ramp", "--ui-display-"],
    ["score ramp", "--ui-score-"],
    ["radius set", "--ui-radius-"],
    ["spacing scale", "--ui-space-"],
  ] as const) {
    it(`the ${name} holds no two identical values`, () => {
      const seen = new Map<string, string>();
      const duplicates: string[] = [];
      for (const [token, value] of valuesOf(prefix)) {
        const previous = seen.get(value);
        if (previous) duplicates.push(`${token} duplicates ${previous} (${value})`);
        else seen.set(value, token);
      }
      expect(duplicates).toEqual([]);
    });
  }

  it("the named density tokens are aliases of the spacing scale, not new numbers", () => {
    for (const token of ["--ui-gutter", "--ui-gap", "--ui-gap-lg"]) {
      expect(rootDeclarations.get(token)).toMatch(/^var\(--ui-space-\d\)/);
    }
  });

  it("the fixture-difficulty scale has five distinct steps, each with a foreground", () => {
    const fills = new Set<string>();
    for (const step of [1, 2, 3, 4, 5]) {
      const fill = rootDeclarations.get(`--ui-fdr-${step}`);
      expect(fill).toBeDefined();
      fills.add(fill ?? "");
      expect(rootDeclarations.get(`--ui-on-fdr-${step}`)).toBeDefined();
    }
    expect(fills.size).toBe(5);
  });
});

describe("ui-kit: the primitives keep their promises", () => {
  const primitives = read("primitives.tsx");
  const barrel = read("index.ts");

  it("exports every primitive from the barrel", () => {
    const declared = [...primitives.matchAll(/^export function (Ui[A-Za-z]+)/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(20);
    const missing = declared.filter((name) => !new RegExp(`\\b${name}\\b`).test(barrel));
    expect(missing).toEqual([]);
  });

  it("ships the primitives a screen must not invent for itself", () => {
    const required = [
      "UiSheet",
      "UiModal",
      "UiInput",
      "UiSelect",
      "UiTable",
      "UiTHead",
      "UiTBody",
      "UiTR",
      "UiTH",
      "UiTD",
      "UiStatBlock",
      "UiPlayerPlate",
      "UiPlayerRow",
      "UiPitchSurface",
      "UiBadge",
      "UiChip",
      "UiPill",
      "UiSkeleton",
      "UiEmptyState",
      "UiErrorState",
      "UiAlert",
      // Option A
      "UiIconButton",
      "UiBackButton",
      "UiTabs",
      "UiPageTitle",
      "UiLivePill",
    ];
    const missing = required.filter(
      (name) => !new RegExp(`export function ${name}\\b`).test(primitives),
    );
    expect(missing).toEqual([]);
  });

  it("states no control height as a literal — heights come from the tap/row tokens", () => {
    // `min-h-0` is the flexbox idiom, not a height.
    const offenders = [...primitives.matchAll(/min-h-(?!0\b)\d[\w.]*/g)].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });

  it("composes aria-describedby instead of replacing the caller's", () => {
    // `{...props}` then `aria-describedby={...}` reads like a default and is
    // the opposite: it overwrote whatever the screen passed, and set it to
    // `undefined` when there was no error and no hint — actively unlinking a
    // description. The register form describes its password field by both its
    // error and its strength meter; the meter was being dropped.
    const offenders = [
      ...primitives.matchAll(/aria-describedby=\{(?!describedBy\()([^}]*)\}/g),
    ].map((m) => m[0].slice(0, 80));
    expect(offenders).toEqual([]);
  });

  it("gives a field's error message a role, so it is announced", () => {
    // A validation message that appears silently tells a screen-reader user
    // nothing; they learn the form failed only from the focus moving.
    const errorLines = [...primitives.matchAll(/id=\{`\$\{id\}-error`\}/g)];
    expect(errorLines.length).toBeGreaterThan(0);
    const withoutRole = [...primitives.matchAll(/<p\s+id=\{`\$\{id\}-error`\}([\s\S]{0,120}?)>/g)]
      .filter((m) => !m[1].includes('role="alert"'))
      .map((m) => m[0].replace(/\s+/g, " "));
    expect(withoutRole).toEqual([]);
  });

  it("paints every button variant it declares", () => {
    /**
     * A variant added to `UiButtonVariant` but never given a branch in
     * `buttonClass` is a button that type-checks, renders, passes every test
     * — and paints nothing. `destructive` shipped that way for exactly one
     * afternoon: two screens asked for it, got a transparent control with
     * body-coloured text where a filled red one belonged, and lost the
     * disabled affordance that the branch would have carried.
     *
     * The union and the painter have to agree, so the test reads both.
     */
    const union = primitives.match(/export type UiButtonVariant =([\s\S]*?);/)?.[1] ?? "";
    const declared = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(3);

    const painter = primitives.match(/function buttonClass\(([\s\S]*?)\n\}/)?.[1] ?? "";
    const unpainted = declared.filter((v) => !painter.includes(`variant === "${v}"`));
    expect(unpainted).toEqual([]);
  });

  it("gives every button variant a disabled affordance", () => {
    // `disabled` on its own only stops the click. A control that still looks
    // armed while it cannot fire is the version a reader argues with.
    const painter = primitives.match(/function buttonClass\(([\s\S]*?)\n\}/)?.[1] ?? "";
    const union = primitives.match(/export type UiButtonVariant =([\s\S]*?);/)?.[1] ?? "";
    const declared = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    const missing = declared.filter((v) => {
      const from = painter.indexOf(`variant === "${v}"`);
      if (from < 0) return false; // the test above owns that failure
      return !painter.slice(from, from + 400).includes("disabled:");
    });
    expect(missing).toEqual([]);
  });

  it("never spells a Close control in English", () => {
    // Every sheet in the product used to close with a hardcoded "Close".
    expect(primitives).not.toMatch(/["'>]\s*Close\s*[<"']/);
    expect(primitives).toMatch(/aria-label=\{t\("fpl\.close"\)\}/);
  });

  it("gives the segmented control a size prop that starts at the tap floor", () => {
    expect(primitives).toMatch(/size\?: UiSegmentedSize/);
    expect(primitives).toMatch(/size === "md"[\s\S]{0,120}--ui-tap-min/);
  });

  it("lets a chip carry aria-current and a ref", () => {
    const chip = primitives.slice(primitives.indexOf("export function UiChip"));
    expect(chip).toMatch(/aria-current/);
    expect(chip).toMatch(/ref\?: Ref<HTMLButtonElement>/);
  });

  it("types every stat figure as tabular", () => {
    const tokens = read("tokens.ts");
    const statRamp = tokens.slice(tokens.indexOf("stat: {"), tokens.indexOf("tone: {"));
    for (const step of ["hero:", "lg:", "md:", "sm:"]) {
      expect(statRamp).toContain(step);
    }
    // Tolerant of a line break: prettier wraps this declaration once the value
    // grows, and the contract is that STAT_BASE STARTS with `fpl-tabular`, not
    // that it fits on one line. The previous `/STAT_BASE = "fpl-tabular/`
    // failed on a reflow that changed nothing about the ramp.
    expect(tokens).toMatch(/STAT_BASE\s*=\s*\n?\s*"fpl-tabular/);
  });

  it("gives every type and stat step a leading token, and never leading-none", () => {
    // BG-0124. `leading-none` sets the line box to the font size, and a font's
    // ink does not fit inside its own em; inside a `truncate` (overflow:hidden
    // for a horizontal ellipsis) the difference is cut off. Measured at 11px:
    // 2px of Latin descender, 5px of Arabic ink — a third of the glyph.
    const tokens = read("tokens.ts");
    const ramp = tokens.slice(tokens.indexOf("text: {"), tokens.indexOf("tone: {"));
    for (const banned of ["leading-none", "leading-tight", "leading-normal"]) {
      expect(ramp).not.toContain(banned);
    }
    for (const step of ["hero:", "title:", "body:", "meta:", "micro:", "label:", "prose:"]) {
      const line = ramp.split("\n").find((l) => l.trim().startsWith(step));
      expect(line).toBeDefined();
      expect(line).toMatch(/leading-\[var\(--ui-leading-(flat|copy|prose)\)\]/);
    }
    expect(tokens).toMatch(/STAT_BASE[\s\S]{0,160}leading-\[var\(--ui-leading-flat\)\]/);
  });

  it("redeclares every leading token for Arabic", () => {
    // The Arabic face needs a taller line box than the Latin one at the same
    // px — 1.73 against 1.36, derived from the two fonts' own metrics. One
    // value cannot serve both scripts, so a leading token with no Arabic
    // counterpart is a token that clips Arabic.
    const arabic = css.slice(css.indexOf(":root:lang(ar)"));
    expect(arabic.length).toBeGreaterThan(0);
    const block = arabic.slice(0, arabic.indexOf("}"));
    for (const token of ["--ui-leading-flat", "--ui-leading-copy", "--ui-leading-prose"]) {
      expect(css).toContain(`${token}:`);
      expect(block).toContain(`${token}:`);
    }
  });
});

describe("ui-kit: no gradient TOKEN states a physical angle", () => {
  /**
   * The suite already forbids a `deg` angle inside the kit's own files and
   * inside `--ui-grad-*`. Everything else in the stylesheet was free to state
   * one, and did: seven `--news-gradient-*` (declared twice, light and dark)
   * and `--bg-brand-gradient` all ran at 110-145deg, so every article hero and
   * the consent page's call to action lit from the opposite corner in Arabic.
   *
   * The rule is about direction, not about which prefix a token happens to
   * carry, so the check is too.
   */
  it("every gradient-valued custom property runs a keyword direction", () => {
    const offenders = [...css.matchAll(/(--[\w-]*grad[\w-]*):\s*([^;]+);/g)]
      .filter(([, , value]) => /(linear|conic)-gradient\([^)]*\d+deg/.test(value))
      .map(([, token]) => token);
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe("ui-kit: the shared background mesh is direction-neutral", () => {
  /**
   * Rule 3 says a gradient angle is physical too, and the kit's own gradient
   * tokens are checked for it. The `mesh-*` utilities were not — and they are
   * what actually paints behind every screen, including the one family that
   * is white-on-dark. `mesh-auth` carried `linear-gradient(160deg, …)`, so
   * the light kept entering from the same physical corner while the content
   * mirrored, and nothing failed.
   *
   * A radial origin is physical in the same way, but unlike an angle it has a
   * legitimate asymmetric use: the design wants a glow entering top-trailing.
   * The rule below is therefore not "no x offset" but "an off-centre x offset
   * must be a custom property", which is what makes it flippable — and the
   * `[dir="rtl"]` rule that flips it has to exist.
   */
  const meshBlocks = [...css.matchAll(/@utility (mesh-[\w-]+) \{([^}]*(?:\}[^@]*?)*?)\n\}/g)].map(
    (m) => ({ name: m[1], body: m[2] }),
  );

  it("finds the mesh utilities at all", () => {
    expect(meshBlocks.map((b) => b.name)).toContain("mesh-auth");
    expect(meshBlocks.length).toBeGreaterThan(4);
  });

  for (const { name, body } of meshBlocks) {
    it(`${name} states no gradient angle in degrees`, () => {
      const offenders = [...body.matchAll(/-?[\d.]+deg/g)].map((m) => m[0]);
      expect(offenders).toEqual([]);
    });

    it(`${name} keeps any off-centre origin in a flippable custom property`, () => {
      // `at <x> <y>` — only the x half is direction-sensitive.
      const origins = [...body.matchAll(/\bat\s+([^\s,]+)\s+([^\s,)]+)/g)].map((m) => m[1]);
      const fixed = origins.filter((x) => !x.startsWith("var(") && x !== "50%");
      expect(fixed).toEqual([]);
    });
  }

  it("mirrors every mesh origin the utilities read", () => {
    // A named origin that is never flipped is worse than a literal: it looks
    // direction-aware and is not.
    const used = new Set(
      meshBlocks.flatMap(({ body }) =>
        [...body.matchAll(/var\((--mesh-x-[\w-]+)\)/g)].map((m) => m[1]),
      ),
    );
    expect(used.size).toBeGreaterThan(0);
    const rtl = [...css.matchAll(/\[dir="rtl"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    const unmirrored = [...used].filter((token) => !rtl.includes(`${token}:`));
    expect(unmirrored).toEqual([]);
  });

  it("declares every mesh origin it mirrors", () => {
    const rtl = [...css.matchAll(/\[dir="rtl"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    const mirrored = [...rtl.matchAll(/(--mesh-x-[\w-]+):/g)].map((m) => m[1]);
    for (const token of mirrored) {
      expect(rootDeclarations.has(token) || css.includes(`${token}:`)).toBe(true);
    }
  });
});

describe("ui-kit: the shared shell is built on the kit", () => {
  // The shell is what makes Home → News → Fixtures → Fantasy → Profile feel
  // like one product. If it drifts back off the kit, the unification is lost.
  const SHELL = ["AppShell.tsx", "TopBar.tsx", "BottomNav.tsx", "PageBackground.tsx"];

  for (const file of SHELL) {
    const code = stripComments(
      readFileSync(join(ROOT, "src", "components", "shell", file), "utf8"),
    );

    it(`${file} draws from the kit`, () => {
      expect(code).toMatch(/ui-kit/);
    });

    it(`${file} uses no physical direction utility`, () => {
      expect(code).not.toMatch(/(^|[\s"'`{])-?(ml|mr|pl|pr)-[\w.[\]/-]+/m);
      expect(code).not.toMatch(/\btext-(left|right)\b/);
      expect(code).not.toMatch(/\bborder-(l|r)(-[\w.[\]/-]+)?(?![\w-])/);
    });

    it(`${file} letter-spaces nothing unless ltr:`, () => {
      const offenders = [...code.matchAll(/(.{0,4})tracking-[\w[\]./-]+/g)]
        .filter((m) => !m[1].endsWith("ltr:"))
        .map((m) => m[0].trim());
      expect(offenders).toEqual([]);
    });
  }
});

describe("ui-kit: Option A — the display face, club colour and shape", () => {
  const DISPLAY_FAMILY = "[font-family:var(--ui-font-display)]";

  it("keeps every stat step on the tabular body face, never the display face", () => {
    // Changa has no `tnum` feature: `tabular-nums` does nothing on it, so a
    // column of Changa figures does not line up. `ui.stat.*` is the ramp for
    // figures read down a column, so it must stay Manrope and tabular.
    const tokens = read("tokens.ts");
    const statBase = tokens.match(/const STAT_BASE\s*=\s*\n?\s*"([^"]*)"/)?.[1] ?? "";
    expect(statBase.startsWith("fpl-tabular")).toBe(true);
    expect(statBase).not.toContain("font-family");
    for (const [step, classes] of Object.entries(ui.stat)) {
      expect({ step, tabular: classes.includes("fpl-tabular") }).toEqual({ step, tabular: true });
      expect({ step, display: classes.includes("--ui-font-display") }).toEqual({
        step,
        display: false,
      });
    }
  });

  it("sets every display and score step in the display face, on its own leading", () => {
    for (const [step, classes] of Object.entries(ui.display)) {
      expect({ step, family: classes.includes(DISPLAY_FAMILY) }).toEqual({ step, family: true });
      expect({ step, leading: /leading-\[var\(--ui-leading-display\)\]/.test(classes) }).toEqual({
        step,
        leading: true,
      });
    }
    for (const [step, classes] of Object.entries(ui.score)) {
      expect({ step, family: classes.includes(DISPLAY_FAMILY) }).toEqual({ step, family: true });
      expect({ step, leading: /leading-\[var\(--ui-leading-figure\)\]/.test(classes) }).toEqual({
        step,
        leading: true,
      });
    }
  });

  it("never teaches a <bdi> as a score's flex container", () => {
    // A `<bdi>` with no `dir` is `dir="auto"`; digits and a dash hold no
    // strong character, so it resolves to LTR and a `<bdi>` flex row prints
    // home on the LEFT in Arabic (measured in Chromium) while the home half of
    // a split header sits on the right. The container inherits the page
    // direction; each figure is its own `<bdi>`. Comments are scanned on
    // purpose: the samples a screen lane copies live in them.
    const bdiFlex = /<bdi\b[^>]*\bclassName=[^>]*\b(inline-)?flex\b/g;
    const sources = [
      [
        "docs/engineering/DESIGN_SYSTEM_V2.md",
        readFileSync(join(ROOT, "docs", "engineering", "DESIGN_SYSTEM_V2.md"), "utf8"),
      ],
      ["src/styles.css", css],
      ...kitFiles.map((file) => [file, readFileSync(join(KIT_DIR, file), "utf8")]),
    ];
    for (const [file, text] of sources) {
      expect({ file, offenders: text.match(bdiFlex) ?? [] }).toEqual({ file, offenders: [] });
    }
    // And the contract still shows the right pattern: a plain container, each
    // figure in its own <bdi>.
    const doc = sources[0][1];
    expect(doc).toMatch(
      /<div\s[^>]*className=\{cn\("flex items-center gap-2", ui\.score\.hero\)\}\s*>\s*<bdi>\{home\}<\/bdi>\s*<span aria-hidden>–<\/span>\s*<bdi>\{away\}<\/bdi>\s*<\/div>/,
    );
  });

  it("never claims tabular figures, or a 900 weight, for the display face", () => {
    // 900 does not exist in Changa (it stops at 800) and would be synthesised;
    // `tabular-nums` on Changa is a no-op that reads like a promise.
    for (const [step, classes] of [...Object.entries(ui.display), ...Object.entries(ui.score)]) {
      expect({ step, hero: classes.includes("--ui-weight-hero") }).toEqual({ step, hero: false });
      expect({ step, tabular: /fpl-tabular|tabular-nums/.test(classes) }).toEqual({
        step,
        tabular: false,
      });
    }
  });

  it("gives the display face and its leading an Arabic value", () => {
    const arabic = css.slice(css.indexOf(":root:lang(ar)"));
    const block = arabic.slice(0, arabic.indexOf("}"));
    for (const token of [
      "--ui-leading-display",
      "--ui-leading-figure",
      "--ui-font-display",
      "--ui-font-body",
    ]) {
      expect({ token, arabic: block.includes(`${token}:`) }).toEqual({ token, arabic: true });
    }
    // Changa carries Arabic, and the Noto stack is its fallback there.
    expect(block).toMatch(/--ui-font-display:\s*"Changa",\s*"Noto Sans Arabic"/);
  });

  it("keeps --ui-font-body the same stack the body uses", () => {
    // `ui.font.body` exists to put the minute prime (which Changa lacks) back
    // into the body face inside display text. Two copies of one stack drift
    // unless something holds them together.
    const theme = css.slice(css.indexOf("@theme inline"));
    const sans = theme.match(/--font-sans:\s*([^;]+);/)?.[1];
    const arabicStack = theme.match(/--font-arabic:\s*([^;]+);/)?.[1];
    expect(rootDeclarations.get("--ui-font-body")).toBe(sans);
    const arabic = css.slice(css.indexOf(":root:lang(ar)"));
    const block = arabic.slice(0, arabic.indexOf("}"));
    expect(block.match(/--ui-font-body:\s*([^;]+);/)?.[1]).toBe(arabicStack);
  });

  it("never makes the display face the body face", () => {
    // The e2e suite asserts the body family per language (Manrope / Noto Sans
    // Arabic). Changa is reachable only through `--ui-font-display`.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const declaring = [...code.matchAll(/([\w-]+)\s*:[^;{}]*Changa[^;{}]*;/g)].map((m) => m[1]);
    expect(declaring.length).toBeGreaterThan(0);
    expect([...new Set(declaring)]).toEqual(["--ui-font-display"]);
    const theme = css.slice(css.indexOf("@theme inline"));
    expect(theme.match(/--font-sans:\s*([^;]+);/)?.[1]).not.toContain("Changa");
  });

  it("draws UiCard and ui.surface.card on the card radius", () => {
    expect(ui.surface.card).toContain("rounded-[var(--ui-radius-card)]");
    expect(ui.radius.card).toBe("rounded-[var(--ui-radius-card)]");
    expect(rootDeclarations.get("--ui-radius-card")).toBe("14px");
  });

  it("rounds every control a thumb presses", () => {
    const primitives = read("primitives.tsx");
    const painter = primitives.match(/function buttonClass\(([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(painter).toContain("ui.radius.full");
    expect(painter).not.toContain("ui.radius.control");
    for (const name of ["UiChip", "UiPill"]) {
      const body = primitives.slice(primitives.indexOf(`export function ${name}`));
      const end = body.indexOf("\nexport function ", 1);
      expect({ name, full: body.slice(0, end).includes("ui.radius.full") }).toEqual({
        name,
        full: true,
      });
    }
  });

  it("themes the club tokens and maps them per element in both themes", () => {
    const club = ["--ui-club", "--ui-on-club", "--ui-club-edge", "--ui-club-fg", "--ui-club-tint"];
    for (const token of club) {
      expect(UI_THEMED_TOKENS as readonly string[]).toContain(token);
      expect(darkDeclarations.get(token)).toBe(rootDeclarations.get(token));
    }
    // The `[data-club]` layer reads the inline `--club-*-l` values in light
    // and `--club-*-d` under `.dark`, on the element that carries them.
    const light = css.match(/(^|\n)\[data-club\]\s*\{([^}]*)\}/)?.[2] ?? "";
    const dark = css.match(/\n\.dark \[data-club\]\s*\{([^}]*)\}/)?.[1] ?? "";
    const pairs: Array<[string, string]> = [
      ["--ui-club", "fill"],
      ["--ui-on-club", "on"],
      ["--ui-club-edge", "edge"],
      ["--ui-club-fg", "fg"],
      ["--ui-club-tint", "tint"],
    ];
    for (const [token, slot] of pairs) {
      expect(light).toMatch(new RegExp(`${token}:\\s*var\\(--club-${slot}-l,`));
      expect(dark).toMatch(new RegExp(`${token}:\\s*var\\(--club-${slot}-d,`));
    }
  });

  it("draws no edge bar or shadow with a physical x offset", () => {
    // The boards drew club edges as `box-shadow: inset 4px 0 0 <club>`. An x
    // offset is physical: it stays on the left in Arabic. The kit's edges are
    // logical borders (`ui.edge.*`), and a shadow may only offset on the block
    // axis (the tab indicator is `inset 0 -4px 0`).
    for (const file of kitFiles) {
      const code = read(file);
      const offenders = [
        ...code.matchAll(/shadow-\[(?:inset_)?(-?(?:\d*\.)?\d+)(?:px|rem|em)?_/g),
        ...code.matchAll(/box-shadow\s*:\s*(?:inset\s+)?(-?(?:\d*\.)?\d+)(?:px|rem|em)?\s/g),
      ]
        .filter((m) => Number(m[1]) !== 0)
        .map((m) => m[0]);
      expect({ file, offenders }).toEqual({ file, offenders: [] });
    }
    expect(ui.edge.start).toContain("border-s-4");
    expect(ui.edge.end).toContain("border-e-4");
  });

  it("keeps the stripe texture's angle in a custom property that flips in Arabic", () => {
    const utility = css.match(/@utility club-stripes \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(utility).toContain("var(--stripe-angle)");
    expect(utility).not.toMatch(/-?\d+deg/);
    expect(rootDeclarations.get("--stripe-angle")).toBe("-45deg");
    const rtl = [...css.matchAll(/\[dir="rtl"\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    expect(rtl).toMatch(/--stripe-angle:\s*45deg/);
  });
});
