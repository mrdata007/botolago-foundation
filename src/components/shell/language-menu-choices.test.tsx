import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";
import { LanguageMenuChoices } from "./LanguageMenuChoices";

/**
 * The language menus (top bar, Profile) announce the chosen language as a
 * checked radio item, not as a "current" menu item (audit 2026-09-25, A12,
 * applied beyond the first-launch chooser). Rendered inside an open Radix
 * menu, which draws on the server when it is not portalled.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function drawMenu() {
  return renderToStaticMarkup(
    <I18nProvider>
      <Menu.Root open modal={false}>
        <Menu.Trigger>menu</Menu.Trigger>
        <Menu.Content>
          <LanguageMenuChoices />
        </Menu.Content>
      </Menu.Root>
    </I18nProvider>,
  );
}

describe("the language menu's choices", () => {
  const items = drawMenu().match(/<div[^>]*role="menuitemradio"[^>]*>/g) ?? [];
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

  it("are two radio items, the language on screen checked", () => {
    expect(items).toHaveLength(2);
    // The server (and the first client render) draws French.
    expect(items.map((tag) => attr(tag, "aria-checked"))).toEqual(["true", "false"]);
  });

  it("name each language in its own language, and say which one", () => {
    expect(items.map((tag) => attr(tag, "lang"))).toEqual(["fr", "ar"]);
    const html = drawMenu();
    expect(html).toContain(">Français<");
    expect(html).toContain(">العربية<");
  });

  it("no longer lean on aria-current, which says 'current', not 'chosen'", () => {
    for (const tag of items) expect(tag).not.toContain("aria-current");
  });

  it("keep the sunken highlight that is the menu's keyboard focus cue", () => {
    for (const tag of items) {
      expect(attr(tag, "class")).toContain(
        "data-[highlighted]:bg-[color:var(--ui-surface-sunken)]",
      );
    }
  });
});

describe("every language menu uses them", () => {
  it.each([["src/components/shell/LanguageSwitcher.tsx"], ["src/routes/profile.tsx"]])(
    "%s opens the radio choices, not a pair of plain menu items",
    (file) => {
      const source = code(file);
      expect(source).toContain("<LanguageMenuChoices />");
      expect(source).not.toMatch(/<UiMenuItem[^>]*setLanguage/);
    },
  );
});
