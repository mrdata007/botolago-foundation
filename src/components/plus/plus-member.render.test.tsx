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
import { premiumCardKeys } from "@/services/use-premium-card-reads";
import { premiumLeagueKeys } from "@/services/use-premium-league-context";
import { toLeagueSeries } from "@/backend/premium/league-context";

import { PlusSeasonSection } from "./PlusSeasonSection";
import { careerToSeasonView } from "./plus-member-data";
import { PointsBars } from "./plus-season-charts";
import { SeasonProvider } from "./plus-season-context";
import { gappedCareer, LEAGUE_ID, leagueAnswer } from "./plus-league-fixture";

async function render(node: ReactElement, client: QueryClient): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/curva"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function seeded(withLeague: boolean): QueryClient {
  const client = new QueryClient();
  client.setQueryData(premiumCardKeys.career(null), gappedCareer());
  if (withLeague) {
    client.setQueryData(
      premiumLeagueKeys.context(null, LEAGUE_ID, null),
      toLeagueSeries(leagueAnswer()),
    );
  }
  return client;
}

describe("« Votre saison » for a member, with the league context", () => {
  it("shows the league's figures and the real journée numbers, never NaN", async () => {
    const html = await render(
      <PlusSeasonSection access="member" leagueId={LEAGUE_ID} />,
      seeded(true),
    );
    const visible = text(html);
    expect(html).toContain('data-testid="plus-season-member"');
    expect(html).not.toContain("NaN");
    // The league's average total, the leader's total and the net transfers (the career's own).
    expect(visible).toContain("214");
    expect(visible).toContain("655");
    expect(visible).toContain("+11");
  });

  it("waits for the league the screen has not chosen yet, then draws the career alone", async () => {
    const html = await render(
      <PlusSeasonSection access="member" leagueId={null} leaguePending />,
      seeded(false),
    );
    expect(html).toContain("pl-skeleton");
  });

  it("with no league to name, draws the career with dashes, not an error", async () => {
    const html = await render(<PlusSeasonSection access="member" leagueId={null} />, seeded(false));
    expect(html).not.toContain("pl-skeleton");
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(text(html)).toContain("—");
    expect(html).not.toContain("NaN");
  });

  it("does not read the league for a non-member", async () => {
    const client = seeded(true);
    const html = await render(<PlusSeasonSection access="locked" leagueId={LEAGUE_ID} />, client);
    expect(html).toContain("pl-lock");
    expect(text(html)).not.toContain("214");
  });
});

describe("the charts label the real journée numbers (finding 2)", () => {
  it("write J.1, 2, 3, 5 under journées 1, 2, 3, 5, and no 4", async () => {
    const view = careerToSeasonView(gappedCareer())!;
    const html = await render(
      <SeasonProvider view={view}>
        <PointsBars label="points" jAxis={(n) => `J.${n}`} />
      </SeasonProvider>,
      new QueryClient(),
    );
    const words = text(html).trim().split(" ");
    expect(words).toEqual(expect.arrayContaining(["J.1", "2", "3", "5"]));
    expect(words).not.toContain("4");
  });

  it("keeps the example on 1 to 11", async () => {
    const html = await render(
      <PointsBars label="points" jAxis={(n) => `J.${n}`} />,
      new QueryClient(),
    );
    const words = text(html).trim().split(" ");
    expect(words).toEqual(expect.arrayContaining(["J.1", "2", "4", "11"]));
  });
});
