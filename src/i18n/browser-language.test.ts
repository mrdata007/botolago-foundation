import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chooserStartLanguage } from "./browser-language";

/**
 * Critique 2026-10-06 (P1-4): the first-launch chooser preselected French
 * even on a phone set to Arabic. It now starts on the first language of the
 * browser's list that BotolaGO speaks.
 */
describe("the language the first-launch chooser starts on", () => {
  it.each([
    [["ar-MA"], "ar"],
    [["ar"], "ar"],
    [["ar-SA", "en-US"], "ar"],
    [["AR_ma"], "ar"],
    // The first language BotolaGO speaks wins, wherever it sits in the list.
    [["en-US", "ar-MA", "fr"], "ar"],
    [["en-GB", "fr-FR", "ar"], "fr"],
    [["fr-MA", "ar-MA"], "fr"],
    [["fr-MA"], "fr"],
    // Neither language, or nothing at all: French, as before.
    [["en-US", "es"], "fr"],
    [[], "fr"],
    // Only the primary subtag counts: Mapudungun is not Arabic.
    [["arn-CL"], "fr"],
  ] as const)("%j starts on %s", (preferred, expected) => {
    expect(chooserStartLanguage(preferred)).toBe(expected);
  });
});

describe("the chooser reads the browser only after hydration", () => {
  // The code without its comments, which talk about `navigator`.
  const source = readFileSync(
    join(import.meta.dir, "..", "components", "shell", "FirstLaunchLanguage.tsx"),
    "utf8",
  )
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("asks for the browser's languages only once the page has hydrated", () => {
    // The server has no `navigator`, and a first render that read it would
    // disagree with the server's markup (the rule at the top of
    // `src/theme/theme.ts`). The gate renders nothing before hydration.
    expect(source).toMatch(
      /useMemo<Language>\(\s*\(\) => \(isHydrated \? chooserStartLanguage\(browserLanguages\(\)\) : "fr"\),\s*\[isHydrated\],?\s*\)/,
    );
    expect(source).toContain("if (!isHydrated || hasChosen) return null;");
    expect(source.match(/browserLanguages\(\)/g)).toHaveLength(1);
    expect(source).not.toContain("navigator");
  });

  it("lets a tap override the browser's language, and stores nothing until Continuer", () => {
    expect(source).toContain("const selected = picked ?? preferred;");
    expect(source).toContain("onSelect={setPicked}");
    expect(source).toContain("onConfirm={() => setLanguage(selected)}");
    expect(source).not.toContain("localStorage");
  });
});
