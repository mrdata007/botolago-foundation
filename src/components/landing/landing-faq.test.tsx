import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { LandingPage } from "./LandingPage";
import { landingFaqItems } from "./landing-faq";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { PRIZES_ENABLED } from "@/lib/feature-flags";
import { SQUAD_RULES } from "@/types/fantasy";
import { Route } from "@/routes/jouer";

/**
 * The FAQ of `/jouer`: the `FAQPage` data in `head()` is the French text the
 * server renders, and every question exists in Arabic.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

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

function headFaq() {
  const head = Route.options.head!({} as never) as {
    scripts?: { type: string; children: string }[];
  };
  const script = head.scripts?.find((s) => s.type === "application/ld+json");
  expect(script).toBeDefined();
  return JSON.parse(script!.children) as {
    "@type": string;
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
}

describe("/jouer FAQ", () => {
  it("marks up exactly the questions and answers the page shows", async () => {
    const faq = headFaq();
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6);
    expect(faq.mainEntity.length).toBeLessThanOrEqual(10);
    const html = await render();
    for (const entry of faq.mainEntity) {
      expect(html).toContain(escapeHtml(entry.name));
      expect(html).toContain(escapeHtml(entry.acceptedAnswer.text));
    }
    // And the page shows no question the data leaves out.
    const shown = (html.match(/<summary[\s\S]*?<\/summary>/g) ?? []).length;
    expect(shown).toBe(faq.mainEntity.length);
  });

  it("is the French dictionary text, with the prize question only while prizes are on", () => {
    const items = landingFaqItems((key) => fr[key], { prizes: PRIZES_ENABLED });
    const faq = headFaq();
    expect(faq.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(
      items.map((i) => [i.question, i.answer]),
    );
    const without = landingFaqItems((key) => fr[key], { prizes: false });
    expect(without.some((i) => i.question === fr["landing.faq_prizes_q"])).toBe(false);
    expect(without.length).toBe(landingFaqItems((key) => fr[key], { prizes: true }).length - 1);
  });

  it("has an Arabic question and answer for every French one", () => {
    const keys = Object.keys(fr).filter((k) => /^landing\.faq_.*_[qa]$/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const key of keys) {
      const value = (ar as Record<string, string>)[key];
      expect(value, key).toBeTruthy();
      expect(value, key).not.toBe((fr as Record<string, string>)[key]);
    }
  });

  it("states the squad and transfer figures the game enforces", () => {
    const squad = fr["landing.faq_squad_a"];
    expect(squad).toContain(`${SQUAD_RULES.budget} millions`);
    expect(squad).toContain(`${SQUAD_RULES.totalSize} joueurs`);
    expect(squad).toContain(`${SQUAD_RULES.perPosition.GK} gardiens`);
    expect(squad).toContain(`${SQUAD_RULES.perPosition.DEF} défenseurs`);
    expect(squad).toContain(`${SQUAD_RULES.perPosition.MID} milieux`);
    expect(squad).toContain(`${SQUAD_RULES.perPosition.FWD} attaquants`);
    expect(squad).toContain(`${SQUAD_RULES.maxPerClub} joueurs par club`);
    expect(squad).toContain(`${SQUAD_RULES.startingXI} titulaires`);
    const transfers = fr["landing.faq_transfers_a"];
    expect(transfers).toContain(`${SQUAD_RULES.freeTransfersPerWeek} transfert gratuit`);
    expect(transfers).toContain(`${SQUAD_RULES.transferHitPoints} points`);
  });

  it("names Botola Fantasy and Fantasy Botola Pro in a title and description within length", () => {
    const head = Route.options.head!({} as never) as {
      meta: { title?: string; name?: string; content?: string }[];
    };
    const title = head.meta.find((m) => m.title)?.title ?? "";
    const description = head.meta.find((m) => m.name === "description")?.content ?? "";
    expect(title).toContain("Botola Fantasy");
    expect(title).toContain("Fantasy Botola Pro");
    expect(description).toContain("Botola Fantasy");
    expect(description).toContain("Fantasy Botola Pro");
    expect(title.length).toBeLessThanOrEqual(62);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(`${title} ${description}`).not.toMatch(/officiel/i);
  });
});
