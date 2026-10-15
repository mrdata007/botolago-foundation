import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { ADMIN_CONSOLE_NAV_ITEMS } from "@/backend/admin/admin-console-contracts";
import { dictionaries } from "./dictionaries";

/**
 * Owner decision, 2026-10-15 (audit finding LOC-09): the under-23 section is
 * named « Prospects » in French (it was « Pépites ») and « المواهب » in Arabic
 * (it was « جواهر », and the Latin « Pépites » leaked into some Arabic lines).
 * Only the words readers see change: the keys stay `pepites.*`, the addresses
 * stay `/pepites`. These cases fail on the old copy and keep both names
 * consistent.
 */

const fr = dictionaries.fr as Record<string, string>;
const ar = dictionaries.ar as Record<string, string>;

/** Every key whose text names the sub-brand (these carried « Pépites » / « جواهر » before). */
const BRAND_KEYS = [
  "unsubscribe.pepites_confirm_title",
  "unsubscribe.pepites_confirm_body",
  "unsubscribe.pepites_done_title",
  "unsubscribe.pepites_already_title",
  "unsubscribe.pepites_reenable_hint",
  "nav.pepites",
  "pepites.brand",
  "pepites.player.back",
  "pepites.meta_title",
  "pepites.state.coming_soon",
  "pepites.state.error",
  "pepites.reveal.meta_title",
  "pepites.home.about",
  "pepites.email.sign_in_reason",
  "pepites.ranking.meta_title",
  "pepites.player.meta_title",
  "pepites.player.not_found",
  "pepites.edition.meta_title",
  "pepites.method.meta_title",
  "pepites.method.meta_description",
  "pepites.share.player_message",
  "pepites.share.image_alt",
  "pepites.share.message",
] as const;

const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();

describe("the sub-brand name, French and Arabic", () => {
  test("the brand key and the navigation label are the settled names", () => {
    expect(fr["pepites.brand"]).toBe("Prospects");
    expect(ar["pepites.brand"]).toBe("المواهب");
    expect(fr["nav.pepites"]).toBe("Prospects");
    expect(ar["nav.pepites"]).toBe("المواهب");
    expect(fr["pepites.player.back"]).toBe("Prospects");
    expect(ar["pepites.player.back"]).toBe("المواهب");
  });

  test("every string that names the sub-brand uses the new name in both languages", () => {
    for (const key of BRAND_KEYS) {
      expect(fr[key], `fr ${key}`).toContain("Prospects");
      expect(ar[key], `ar ${key}`).toContain("المواهب");
    }
  });

  test("no Arabic string uses the old name جواهر or the Latin Pépites", () => {
    // No legitimate other use of جواهر ("jewels") exists in the dictionary.
    for (const [key, value] of Object.entries(ar)) {
      expect(value, `ar ${key}`).not.toContain("جواهر");
      expect(value, `ar ${key}`).not.toMatch(/p[ée]pites?/i);
    }
  });

  test("no French string names the sub-brand Pépites", () => {
    // No generic use of the common word « pépite » exists in the dictionary.
    for (const [key, value] of Object.entries(fr)) {
      expect(value, `fr ${key}`).not.toMatch(/p[ée]pites?/i);
    }
  });

  test("the new Arabic name is never glued to a preposition it cannot take", () => {
    // « ال » is part of the name: no « بالمواهب » / « للمواهب » rewrites of the old bare name.
    for (const key of BRAND_KEYS) {
      expect(ar[key], `ar ${key}`).not.toMatch(/بالمواهب|للمواهب|والمواهب/);
    }
  });

  test("keys and placeholders still match between French and Arabic", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(fr).sort());
    for (const key of BRAND_KEYS) {
      expect(placeholders(ar[key]), key).toEqual(placeholders(fr[key]));
    }
  });

  test("the staff console names the section with the new names", () => {
    const item = ADMIN_CONSOLE_NAV_ITEMS.find((entry) => entry.route === "/admin/pepites");
    // The item exists only in a build where the section is on; when it does, it uses the new names.
    if (item) {
      expect(item.labels.fr).toBe("Prospects");
      expect(item.labels.ar).toBe("المواهب");
    }
  });
});

describe("code-side text that readers see", () => {
  const visibleLines = (path: string) =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  test.each([
    "supabase/functions/_shared/notification-email-render.ts",
    "src/routes/pepites.index.tsx",
    "src/routes/admin.pepites.index.tsx",
    "src/components/pepites/admin/PepitesAdminData.tsx",
    "src/components/pepites/admin/PepitesAdminEditions.tsx",
    "src/backend/admin/admin-console-contracts.ts",
  ])("%s writes neither Pépites nor جواهر in a string", (path) => {
    const hits = visibleLines(path).filter((line) => /Pépites|pépites|PÉPITES|جواهر/.test(line));
    expect(hits).toEqual([]);
  });
});
