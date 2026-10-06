import { describe, expect, it } from "bun:test";

import { renderErrorPage } from "./error-page";

/**
 * BG-0149 gave the static error page a dark palette that follows the phone.
 * The light page must stay exactly what it was before, value for value, so
 * this resolves every colour the light page paints and compares it with the
 * literal it had on main (`background: #fafafa; color: #111` and so on).
 */
const html = renderErrorPage();
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

const varsIn = (block: string) =>
  new Map([...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const lightVars = varsIn(style.match(/^\s*:root\s*\{([^}]*)\}/m)?.[1] ?? "");
const darkBlock = style.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
const darkVars = varsIn(darkBlock?.[1] ?? "");

const rule = (selector: string) =>
  style.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ??
  "";
const resolve = (value: string, vars: Map<string, string>) =>
  value.replace(/var\((--[a-z-]+)\)/g, (_, name: string) => vars.get(name) ?? `MISSING ${name}`);
const prop = (selector: string, property: string, vars: Map<string, string>) => {
  const declared = rule(selector).match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1];
  return declared === undefined ? undefined : resolve(declared.trim(), vars);
};

describe("static error page", () => {
  it("keeps every light colour it had before dark mode", () => {
    expect(prop("body", "background", lightVars)).toBe("#fafafa");
    expect(prop("body", "color", lightVars)).toBe("#111");
    expect(prop("p", "color", lightVars)).toBe("#4b5563");
    expect(prop(".primary", "background", lightVars)).toBe("#111");
    expect(prop(".primary", "color", lightVars)).toBe("#fff");
    expect(prop(".secondary", "background", lightVars)).toBe("#fff");
    expect(prop(".secondary", "color", lightVars)).toBe("#111");
    expect(prop(".secondary", "border-color", lightVars)).toBe("#d1d5db");
  });

  it("follows the phone into dark, with every variable redeclared", () => {
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(darkBlock).not.toBeNull();
    expect([...darkVars.keys()].sort()).toEqual([...lightVars.keys()].sort());
    // The primary button inverts: light ink fill, page-dark text.
    expect(prop(".primary", "background", darkVars)).toBe("#eef1f8");
    expect(prop(".primary", "color", darkVars)).toBe("#0d1526");
  });
});
