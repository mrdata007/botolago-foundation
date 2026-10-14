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

import { AuthProvider } from "@/auth/AuthProvider";
import { I18nProvider } from "@/i18n/provider";
import { mockLeagueContext } from "@/backend/premium/league-context-mock";
import { toLeagueSeries } from "@/backend/premium/league-context";
import { mockCareer } from "@/backend/premium/card-reads-mock";

import { PlusGraceBanner } from "./PlusRenewal";
import { careerToSeasonView } from "./plus-member-data";
import { CARD_STYLES, editionLabel } from "./plus-card-style";
import { SEASON_RAW } from "./plus-season-data";

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
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

describe("the member side", () => {
  it("the grace banner says the payment date, the way to fix it and links to Profil", async () => {
    const html = await render(<PlusGraceBanner dueOn={new Date("2026-10-12T00:00:00Z")} />);
    expect(html).toContain('data-testid="plus-grace-banner"');
    expect(html).toContain("Paiement non reçu");
    expect(html).toContain("Mettre à jour");
    expect(html).toContain('href="/profile"');
  });

  it("the picker offers the standard card first, then the four editions", () => {
    expect(CARD_STYLES).toEqual(["standard", "holo", "electric", "pixel", "chrome"]);
    expect(editionLabel((key) => key, "standard")).toBe("plus.pick.standard");
  });

  it("the development member reads as one person everywhere: 612 points, third of five", () => {
    const total = SEASON_RAW.you.reduce((a, b) => a + b, 0);
    expect(total).toBe(612);
    expect(mockCareer().weeks.reduce((a, w) => a + w.score, 0)).toBe(612);
    const league = mockLeagueContext(null);
    expect(league.me.total).toBe(612);
    expect(league.me.rank).toBe(3);
    expect(league.league.members).toBe(5);
  });

  it("with the development league, no figure of the season is missing", () => {
    const view = careerToSeasonView(mockCareer(), toLeagueSeries(mockLeagueContext(null)))!;
    expect(view.raw.leagueAvg.every(Number.isFinite)).toBe(true);
    expect(view.raw.youRank.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(view.S.leagueTotal)).toBe(true);
    expect(Number.isFinite(view.raw.leaderTotal)).toBe(true);
  });
});
