import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import type { MatchVotesDto } from "@/backend/predictions/contracts";
import { matchVotesKey } from "@/components/predictions/use-match-votes";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { Club, Match } from "@/types/domain";
import { NextMatchPick } from "./NextMatchPick";

/**
 * The pick card in Home's band, rendered the way the server renders it: a
 * memory router, the French dictionary, a signed-out reader and a query cache
 * holding (or not) the match's votes.
 */

const fr = dictionaries.fr;

const club = (id: string, name: string, code: string): Club => ({
  id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const UTS = club("uts", "UTS Rabat", "UTS Rabat");
const RSB = club("rsb", "RSB Berkane", "RSB Berkane");

const MATCH: Match = {
  id: "00000020-0000-4000-8000-000000000001",
  gameweek: 3,
  homeClubId: UTS.id,
  awayClubId: RSB.id,
  kickoff: "2026-10-08T16:00:00.000Z",
  status: "scheduled",
  venue: { fr: "", ar: "" },
};

const OPEN: MatchVotesDto = {
  schemaVersion: 1,
  allowed: true,
  serverTime: "2026-10-06T15:00:00.000Z",
  fixtureId: MATCH.id,
  covered: true,
  open: true,
  questions: [
    { question: "winner", counts: { home: 5, draw: 2, away: 3 }, mine: null },
    { question: "both_score", counts: { yes: 1, no: 0 }, mine: null },
    { question: "first_goal", counts: { home: 0, none: 0, away: 0 }, mine: null },
  ],
};
const OFF: MatchVotesDto = {
  schemaVersion: 1,
  allowed: false,
  serverTime: "2026-10-06T15:00:00.000Z",
};

async function render(node: ReactElement, votes?: MatchVotesDto): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (votes) client.setQueryData(matchVotesKey(MATCH.id, ""), votes);
  // The auth provider sits inside the router, as in `__root.tsx`: its
  // second-factor gate reads the router's location.
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

const pick = (props: Partial<Parameters<typeof NextMatchPick>[0]> = {}) => (
  <NextMatchPick match={MATCH} home={UTS} away={RSB} withVote {...props} />
);
const voteButtons = (html: string) => html.match(/aria-pressed=/g)?.length ?? 0;

describe("NextMatchPick — the vote row", () => {
  it("holds the vote row's place while the votes are not known, as the server renders it", async () => {
    const html = await render(pick());
    expect(html).toContain('data-testid="home-vote-hold"');
    expect(voteButtons(html)).toBe(0);
    // The hold is the question's line (invisible) and three blank capsules,
    // hidden from assistive tech: nothing to read or press.
    expect(html).toMatch(/<div class="mt-3" aria-hidden="true" data-testid="home-vote-hold">/);
    expect(html).toContain("invisible");
    expect(html.match(/min-h-\[var\(--ui-tap-min\)\]/g)?.length).toBe(3);
  });

  it("holds the place in the buttons' own shape, labels kept invisible, so it wraps where they will", async () => {
    const held = await render(pick());
    const shown = await render(pick(), OPEN);
    const hold = held.slice(held.indexOf('data-testid="home-vote-hold"'));
    for (const label of ["UTS Rabat", fr["predictions.votes.draw"], "RSB Berkane"]) {
      expect(hold).toContain(`<span class="invisible">${label}</span>`);
    }
    // The capsule's classes are the button's, up to the edge colour and fill.
    const shell = (html: string, tag: string) =>
      [...html.matchAll(new RegExp(`<${tag} [^>]*class="(flex min-h-[^"]+)"`, "g"))].map((m) =>
        m[1]!.split(" ").filter((c) => !/^(border-|bg-|text-\[color|focus-visible)/.test(c)),
      );
    expect(shell(shown, "button")).toHaveLength(3);
    expect(shell(hold, "span")).toEqual(shell(shown, "button"));
    // Every state carries the 1px edge, so a chosen button is as tall as the rest.
    expect(shell(shown, "button").every((classes) => classes.includes("border"))).toBe(true);
  });

  it("shows the question and its three buttons once the votes are in", async () => {
    const html = await render(pick(), OPEN);
    expect(html).not.toContain("home-vote-hold");
    expect(voteButtons(html)).toBe(3);
    expect(html).toContain(fr["predictions.votes.winner"]);
    expect(html).toContain(fr["predictions.votes.draw"]);
  });

  it("closes the row when there is no vote to cast", async () => {
    const html = await render(pick(), OFF);
    expect(html).not.toContain("home-vote-hold");
    expect(voteButtons(html)).toBe(0);
  });

  it("draws no vote row at all when the caller offers none", async () => {
    const html = await render(pick({ withVote: false }));
    expect(html).not.toContain("home-vote-hold");
    expect(voteButtons(html)).toBe(0);
  });

  it("waiting to read the votes holds the row, and shows votes it has already read", async () => {
    expect(await render(pick({ votesEnabled: false }))).toContain("home-vote-hold");
    expect(voteButtons(await render(pick({ votesEnabled: false }), OPEN))).toBe(3);
  });
});

describe("NextMatchPick — in the band's carousel", () => {
  it("keeps today's top margin on its own, and fills its slide in the carousel", async () => {
    const alone = await render(pick());
    const slide = await render(pick({ fill: true }));
    expect(alone).toMatch(/class="p-3 mt-5 [^"]*" data-testid="home-next-match"/);
    expect(slide).toMatch(/class="p-3 flex flex-1 flex-col [^"]*" data-testid="home-next-match"/);
    expect(slide).not.toMatch(/class="p-3 mt-5/);
  });
});
