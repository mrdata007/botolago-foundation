import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { UI_THEMED_TOKENS, UI_TOKENS } from "./tokens";

/**
 * The UI kit is the layer every other page will copy from, so a defect
 * introduced here is a defect introduced product-wide. Three classes of
 * defect have shipped in this codebase before and none of them failed a
 * typecheck or a lint:
 *
 *   1. Physical direction utilities (`ml-`, `pr-`, `text-left`, `border-l`,
 *      `left-`). They look correct in French and silently break Arabic.
 *   2. Letter-spacing applied to Arabic (`tracking-*` with no `ltr:`
 *      prefix). Arabic letterforms join; spacing them apart in either
 *      direction breaks the word. This is the open defect BG-0069 and the
 *      kit must not reproduce it.
 *   3. Hardcoded colours (`bg-white`, `text-black`, `#rrggbb`,
 *      `text-white`). They pin one theme and make dark mode unreachable.
 *
 * The kit is scanned as source text, because these are Tailwind class
 * strings: nothing at runtime can observe them.
 */

const KIT_DIR = import.meta.dir;
const ROOT = join(KIT_DIR, "..", "..", "..");

const kitFiles = readdirSync(KIT_DIR)
  .filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))
  .sort();

/** Strip comments so the rules above, written in prose, are not themselves matched. */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (name: string) => stripComments(readFileSync(join(KIT_DIR, name), "utf8"));

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
  ];

  for (const file of kitFiles) {
    for (const { name, re, use } of FORBIDDEN) {
      it(`${file} uses no ${name} (use ${use})`, () => {
        const match = read(file).match(re);
        expect(match?.[0] ?? null).toBeNull();
      });
    }
  }
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
  }

  it("every colour-bearing token is redeclared for dark mode", () => {
    const css = readFileSync(join(ROOT, "src", "styles.css"), "utf8");
    const darkBlock = css.slice(css.indexOf("--ui-shadow-column"));
    for (const token of UI_THEMED_TOKENS) {
      expect(darkBlock).toContain(`${token}:`);
    }
  });
});

describe("ui-kit: the token manifest matches the stylesheet", () => {
  const css = readFileSync(join(ROOT, "src", "styles.css"), "utf8");

  it("declares every token the manifest names", () => {
    const missing = UI_TOKENS.filter((token) => !css.includes(`${token}:`));
    expect(missing).toEqual([]);
  });

  it("names every --ui-* token the stylesheet declares", () => {
    const declared = new Set([...css.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
    const unlisted = [...declared].filter(
      (token) => !(UI_TOKENS as readonly string[]).includes(token),
    );
    expect(unlisted).toEqual([]);
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
