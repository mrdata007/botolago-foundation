import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { DEMO_DEFAULT_CAPTAIN, DEMO_ROWS } from "./demo-squad";
import { LandingPage } from "./LandingPage";

/**
 * The landing page as the server renders it: no session is known there, so
 * the primary action must hold its place without a label rather than guess,
 * and every claim the page makes must be one the product supports.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;
const ROOT = join(import.meta.dir, "..", "..", "..");

async function render(): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <AuthProvider>
          <LandingPage />
        </AuthProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/jouer"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("LandingPage (server render)", () => {
  it("leads with the promise as the page's only H1", async () => {
    const html = await render();
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(html).toContain(escapeHtml(fr["landing.title_1"]));
    expect(html).toContain(escapeHtml(fr["landing.title_2"]));
  });

  it("holds the primary action's place without guessing its label before the session is known", async () => {
    const html = await render();
    expect(html).toContain(`aria-label="${fr["landing.cta_pending"]}"`);
    expect(html).not.toContain('data-testid="landing-cta-hero"');
  });

  it("labels the pitch as a demonstration, with no player names, prices or points", async () => {
    const html = await render();
    expect(html).toContain('data-testid="landing-demo-pitch"');
    expect(html).toContain(escapeHtml(fr["landing.demo_badge"]));
    // Eleven plates, each a position and a shirt number; the captain shows ×2.
    expect(DEMO_ROWS.flat()).toHaveLength(11);
    expect(DEMO_ROWS.flat().some((slot) => slot.id === DEMO_DEFAULT_CAPTAIN)).toBe(true);
    expect(html).toContain("×2");
  });

  it("keeps guest access, the rules and the help one tap away", async () => {
    const html = await render();
    expect(html).toContain('href="/matches"');
    expect(html).toContain('href="/fantasy/rules"');
    expect(html).toContain('href="/fantasy/help"');
  });

  it("answers the objections in five native disclosures", async () => {
    const html = await render();
    expect(html.match(/<details/g) ?? []).toHaveLength(5);
  });
});

describe("landing copy", () => {
  const keys = Object.keys(fr).filter((key) => key.startsWith("landing."));

  it("exists in Arabic for every French key, in Arabic script", () => {
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      const value = (ar as Record<string, string>)[key];
      expect(value).toBeDefined();
      expect(/[؀-ۿ]/.test(value)).toBe(true);
    }
  });

  it("makes no claim the product cannot back: no counts of users, no ratings, no winners", () => {
    const all = keys.map((key) => `${fr[key as keyof typeof fr]} ${ar[key as keyof typeof ar]}`);
    for (const text of all) {
      expect(text).not.toMatch(
        /\d[\d\s.,]*\s*(fans|joueurs inscrits|managers inscrits|utilisateurs)/i,
      );
      expect(text).not.toMatch(/★|\/5|note moyenne|PS5|GTA/i);
    }
  });

  it("does not hard-code the join deadline or a countdown", () => {
    const source = readFileSync(join(ROOT, "src/components/landing/LandingPage.tsx"), "utf8");
    expect(source).toContain("joinTarget(");
    expect(source).toContain("joinDeadlineToShow(");
    expect(source).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});
