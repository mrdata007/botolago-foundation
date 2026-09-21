import { describe, expect, it } from "bun:test";

import {
  DARK_CLASS,
  DARK_MEDIA_QUERY,
  DEFAULT_THEME_CHOICE,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isThemeChoice,
  resolveTheme,
} from "./theme";

describe("theme: the stored preference", () => {
  it("uses the codebase's storage-key convention", () => {
    // `botolago.language` is the shape already in use (src/i18n/provider.tsx).
    // `botolago.lang` is the near-miss that has produced a wrong measurement
    // before; pin the real key so it cannot drift back.
    expect(THEME_STORAGE_KEY).toBe("botolago.theme");
  });

  it("defaults to following the system", () => {
    expect(DEFAULT_THEME_CHOICE).toBe("system");
  });

  it("accepts only the three choices", () => {
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("botola")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe("theme: resolution", () => {
  it("pins light and dark regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("theme: the inline head script", () => {
  it("reads the same key and media query the React side uses", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(DARK_MEDIA_QUERY));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(DARK_CLASS));
  });

  it("cannot terminate its own <script> element", () => {
    // It is written with dangerouslySetInnerHTML, so a `</` would end the tag.
    expect(THEME_INIT_SCRIPT).not.toContain("</");
  });

  it("is synchronous, self-contained and small enough to inline", () => {
    expect(THEME_INIT_SCRIPT.startsWith("(function(){")).toBe(true);
    expect(THEME_INIT_SCRIPT.length).toBeLessThan(600);
  });

  it("guards storage and matchMedia separately", () => {
    // Both throw in some privacy modes. A single try/catch around the whole
    // body would mean a storage failure also skipped the system fallback.
    expect([...THEME_INIT_SCRIPT.matchAll(/catch\(/g)].length).toBeGreaterThanOrEqual(3);
  });

  it("runs the same decision the pure resolver makes", () => {
    const run = (stored: string | null, prefersDark: boolean) => {
      const classes = new Set<string>();
      const documentElement = {
        classList: {
          toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
        },
        style: { colorScheme: "" },
      };
      const scope = {
        document: { documentElement },
        window: {
          localStorage: { getItem: () => stored },
          matchMedia: () => ({ matches: prefersDark }),
        },
      };
      new Function("document", "window", THEME_INIT_SCRIPT)(scope.document, scope.window);
      return classes.has(DARK_CLASS) ? "dark" : "light";
    };

    for (const prefersDark of [true, false]) {
      expect(run("light", prefersDark)).toBe(resolveTheme("light", prefersDark));
      expect(run("dark", prefersDark)).toBe(resolveTheme("dark", prefersDark));
      expect(run("system", prefersDark)).toBe(resolveTheme("system", prefersDark));
      // Nothing stored, or junk stored, falls back to the system.
      expect(run(null, prefersDark)).toBe(resolveTheme("system", prefersDark));
      expect(run("neon", prefersDark)).toBe(resolveTheme("system", prefersDark));
    }
  });
});
