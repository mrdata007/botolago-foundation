import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { fromMyCard } from "@/components/manager-card/to-profile";

import { FounderBlock } from "./FounderBlock";
import { deriveReplayItems } from "./replay-items";
import { RevoirList } from "./RevoirList";
import { StatTiles } from "./StatTiles";
import { TierLadder } from "./TierLadder";

/**
 * The blocks of G1 and G2 that need no data of their own, rendered on the server in the app's
 * providers: what the tier ladder marks, what a statistic that is not there says, which moments
 * « Revoir » lists, and that the founder block exists for a founder and for no one else.
 */
const fr = dictionaries.fr;

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/gradins"] }),
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
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const card = (id: keyof typeof FIXTURES) => FIXTURES[id].card!;

describe("« Votre palier »", () => {
  it("marks the tier the card holds, once, and says the next one and what the tier follows", async () => {
    const html = await render(<TierLadder card={card("rated")} />);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    const current = html.match(/<li[^>]*aria-current="true"[\s\S]*?<\/li>/)![0];
    expect(text(current)).toContain("PRO");
    expect(text(current)).toContain(fr["gradins.card.tier_now"]);
    for (const tier of ["HOMA", "STADE", "PRO", "CHAMPION", "LEGEND"]) {
      expect(text(html)).toContain(tier);
    }
    expect(text(html)).toContain("CHAMPION à partir de 88.");
    expect(text(html)).toContain(fr["gradins.card.tier_explain"]);
  });

  it("marks no tier before the first note, and says the tier comes with it", async () => {
    const html = await render(<TierLadder card={card("forming1")} />);
    expect(html).not.toContain('aria-current="true"');
    expect(text(html)).toContain(fr["gradins.card.tier_none"]);
  });

  it("states a fall plainly, with the best tier of the season, and promises nothing", async () => {
    const html = await render(<TierLadder card={card("tierDown")} />);
    expect(text(html)).toContain("Palier actuel : STADE. Meilleur cette saison : PRO.");
  });
});

describe("the statistics", () => {
  it("shows a dash and the server's reason for a statistic that is missing, never a zero", async () => {
    const html = await render(<StatTiles card={card("ratedTrfNull")} />);
    const trf = html.match(/data-stat="trf"[\s\S]*?<\/li>/)![0];
    expect(text(trf)).toContain("—");
    expect(text(trf)).toContain(fr["card.reason.no_transfers"]);
    const cap = html.match(/data-stat="cap"[\s\S]*?<\/li>/)![0];
    expect(text(cap)).toContain("91");
    expect(html).toContain('href="/gradins/carte"');
  });

  it("shows four dashes with their reason for a card that is still forming", async () => {
    const html = await render(<StatTiles card={card("born0")} />);
    expect(html.match(/—/g)!.length).toBeGreaterThanOrEqual(4);
    expect(text(html)).toContain(fr["card.reason.pending_minimum"]);
  });
});

describe("« Revoir »", () => {
  it("lists the first note, the first time at a tier, and the founder mark, each as a button", async () => {
    const f = FIXTURES.founder;
    const items = deriveReplayItems(f.card!, f.history);
    const html = await render(<RevoirList items={items} card={f.card!} onOpen={() => {}} />);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(text(html)).toContain("La première note · J7");
    expect(text(html)).toContain("Première fois PRO · J8");
    expect(text(html)).toContain(fr["card.onboarding.m9.heading"]);
  });

  it("draws nothing for a card with nothing to replay", async () => {
    const html = await render(<RevoirList items={[]} card={card("born0")} onOpen={() => {}} />);
    expect(html).not.toContain("gradins-revoir");
  });
});

describe("the founder block", () => {
  it("exists for the founder, with the line, the name in the line only and the cut-off date", async () => {
    const c = card("founder");
    const html = await render(<FounderBlock card={c} profile={fromMyCard(c)} />);
    expect(html).toContain('data-testid="gradins-founder"');
    expect(text(html.match(/<h2[\s\S]*?<\/h2>/)![0])).toBe(` ${fr["card.onboarding.m9.heading"]} `);
    expect(text(html)).toContain("ALI ·26");
    expect(text(html)).toContain("30 novembre 2026");
  });

  it("is not there for anyone who is not a founder: no teaser, no « éligible »", async () => {
    const c = card("rated");
    const html = await render(<FounderBlock card={c} profile={fromMyCard(c)} />);
    expect(html).toBe("");
  });
});
