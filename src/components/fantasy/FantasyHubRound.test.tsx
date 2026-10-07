import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { FantasySummary, Gameweek } from "@/types/domain";
import type { FantasyTeam } from "@/types/fantasy";
import { FantasyHubRound } from "./FantasyHubRound";

/**
 * BG-0155 (2) — "Mes points J{n}" on the hub sits under the CURRENT round's
 * title. The summary's figure is the current round's result or else the
 * latest one (`pointsGameweek` says which), so the card prints it only when
 * it is this round's; otherwise an en dash — not someone else's round, and
 * not a 0. Rendered with `react-dom/server` inside a memory router (the
 * section's "FDR" link) and the French dictionary, like the hub's other
 * render tests. No fixtures: the card is not in its "before the first
 * kickoff" state, so the figure branch is the one drawn.
 */

const fr = dictionaries.fr;

const TEAM: FantasyTeam = {
  managerName: "Amine",
  teamName: "Atlas XI",
  formation: "4-4-2",
  squad: Array.from({ length: 15 }, (_, index) => ({ playerId: `p${index}`, slot: index + 1 })),
  bank: 1.4,
  freeTransfers: 1,
  pendingTransfers: 0,
};

const ROUND_14: Gameweek = {
  number: 14,
  deadline: new Date(Date.now() + 38 * 3_600_000).toISOString(),
  isCurrent: true,
  status: "open",
  averagePoints: 46,
  highestPoints: 92,
};

const SUMMARY: FantasySummary = {
  managerName: "Amine",
  teamName: "Atlas XI",
  totalPoints: 612,
  gameweekPoints: 58,
  pointsGameweek: 13,
  overallRank: 12_483,
  gameweekRank: 4_129,
  transfersLeft: 1,
  bankValue: 1.4,
  teamValue: 100.3,
};

async function render(summary: FantasySummary | null, gameweek: Gameweek = ROUND_14) {
  const node = (
    <FantasyHubRound
      team={TEAM}
      players={[]}
      clubs={[]}
      fixtures={[]}
      fixturesPending={false}
      gameweek={gameweek}
      summary={summary}
      summaryPending={false}
    />
  );
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/fantasy"] }),
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

const text = (html: string) => html.replace(/<[^>]+>/g, "");

/** The text of the "Mes points J{n}" section, heading included. */
function myPoints(html: string, round: number): string {
  const title = fr["fantasy.hub.my_points"].replace("{gw}", String(round));
  const sections = [...html.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/g)].map((m) =>
    text(m[1]),
  );
  const section = sections.find((body) => body.startsWith(title));
  expect(section).toBeDefined();
  return (section ?? "").slice(title.length);
}

describe("Mes points J{n}: the figure only when it is that round's", () => {
  it("the figure is last round's: an en dash under this round's title, not 58", async () => {
    const body = myPoints(await render(SUMMARY), 14);
    expect(body).toContain(fr["fantasy.stat.none"]);
    expect(body).not.toContain("58");
    expect(body).not.toMatch(/\b0\b/);
  });

  it("the figure is this round's: it is shown", async () => {
    const body = myPoints(await render({ ...SUMMARY, pointsGameweek: 14 }), 14);
    expect(body).toContain("58");
    expect(body).toContain(fr["fantasy.points.unit_other"]);
    expect(body).not.toContain(fr["fantasy.stat.none"]);
  });

  it("no result at all, or no summary: an en dash, never 0", async () => {
    for (const summary of [{ ...SUMMARY, gameweekPoints: 0, pointsGameweek: null }, null]) {
      const body = myPoints(await render(summary), 14);
      expect(body).toContain(fr["fantasy.stat.none"]);
      expect(body).not.toMatch(/\b0\b/);
    }
  });
});
