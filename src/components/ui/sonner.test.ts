import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UI_TOKENS } from "@/components/ui-kit/tokens";
import { dictionaries } from "@/i18n/dictionaries";

/**
 * sonner names the toasts' landmark "Notifications" and a toast's close
 * button "Close toast", in English whatever the page's language. The
 * Toaster names both from the dictionaries instead. Source-shape, because in
 * French the landmark's name is the same word either way.
 */
const source = readFileSync(join(import.meta.dir, "sonner.tsx"), "utf8");

describe("the Toaster's accessible names", () => {
  it("come from the dictionaries, not from sonner's English defaults", () => {
    expect(source).toContain('containerAriaLabel={t("toast.region")}');
    expect(source).toContain('closeButtonAriaLabel: t("toast.close")');
  });

  it("exist in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      expect(dictionaries[lang]["toast.region"]).toBeTruthy();
      expect(dictionaries[lang]["toast.close"]).not.toMatch(/close toast/i);
    }
  });
});

/**
 * BG-0149 — the toasts follow the theme. Sonner's stylesheet is unlayered, so
 * its own rules beat every Tailwind class; the Toaster has to (a) tell Sonner
 * which theme is on screen, from the app's theme provider, and (b) point the
 * `--normal-*` variables those rules read at kit tokens. Measured in a real
 * browser for the PR (computed colours equal the kit tokens in both themes);
 * this pins the source shape that made that true.
 */
describe("the Toaster follows the theme", () => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("passes Sonner the theme on screen, from useTheme()", () => {
    expect(code).toContain('import { useTheme } from "@/theme/provider";');
    expect(code).toMatch(/const \{ resolved \} = useTheme\(\);/);
    expect(code).toContain("theme={resolved}");
  });

  it("maps Sonner's --normal-* variables to kit tokens, on the toaster's own element", () => {
    expect(code).toContain('"--normal-bg": "var(--ui-surface)"');
    expect(code).toContain('"--normal-text": "var(--ui-on-surface)"');
    expect(code).toContain('"--normal-border": "var(--ui-rule)"');
    expect(code).toContain("style={TOASTER_STYLE}");
  });

  it("reaches for kit tokens only — no V1 glass, text, colour, brand or shadow tokens", () => {
    const tokens = [...code.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]);
    expect(tokens.length).toBeGreaterThan(10);
    const foreign = tokens.filter((token) => !token.startsWith("--ui-"));
    expect(foreign).toEqual([]);
    for (const token of tokens) {
      expect(UI_TOKENS as readonly string[]).toContain(token);
    }
  });

  it("marks every colour class important, so it beats Sonner's unlayered CSS", () => {
    const colourClasses = code
      .split(/[\s"'`]+/)
      .filter((cls) => /(?:bg|text|border(?:-s)?)-\[color:/.test(cls));
    expect(colourClasses.length).toBeGreaterThan(8);
    const unmarked = colourClasses.filter((cls) => !/(^|:)!/.test(cls));
    expect(unmarked).toEqual([]);
  });
});
