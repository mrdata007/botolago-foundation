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

import { mockMateTrophies } from "@/backend/trophies/mock";
import { I18nProvider } from "@/i18n/provider";
import { leagueStandings } from "@/mocks/fantasy-data";

import { LeagueRows } from "./LeagueRows";
import { buildRows } from "./people";

async function render(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/curva/les-votres"] }),
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

const rows = buildRows(leagueStandings.lg1!, [], "me");
const answer = mockMateTrophies("lg1");
const trophies = new Map(
  (answer.available ? answer.members : []).map((member) => [member.teamId, member]),
);
const noop = () => undefined;

describe("the trophy chip in « Les vôtres »", () => {
  it("shows the count of a league mate who shows trophies, and nothing for the others", async () => {
    const html = await render(
      <LeagueRows rows={rows} caption="Les Lions" trophies={trophies} onOpenTrophies={noop} />,
    );
    // two mates show trophies: m1 holds three, m2 one
    expect(html.match(/data-testid="curva-mate-trophies"/g)).toHaveLength(2);
    expect(html).toContain("Youssef A. : 3 trophées, voir");
    expect(html).toContain("Salma B. : 1 trophée, voir");
    // m4 and m5 show none, and the reader's own row never has a chip
    expect(html).not.toContain("Karim F. :");
    expect(html).not.toContain("You :");
  });

  it("never gives the reader's own row a chip, even if the map names it", async () => {
    const own = new Map(trophies).set("me", { ...trophies.get("m1")!, teamId: "me" });
    const html = await render(
      <LeagueRows rows={rows} caption="Les Lions" trophies={own} onOpenTrophies={noop} />,
    );
    expect(html.match(/data-testid="curva-mate-trophies"/g)).toHaveLength(2);
  });

  it("draws no chip without the trophies or without a way to open them", async () => {
    const plain = await render(<LeagueRows rows={rows} caption="Les Lions" />);
    expect(plain).not.toContain("curva-mate-trophies");
    const noHandler = await render(
      <LeagueRows rows={rows} caption="Les Lions" trophies={trophies} />,
    );
    expect(noHandler).not.toContain("curva-mate-trophies");
  });
});
