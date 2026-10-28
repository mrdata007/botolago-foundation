import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
const pressed = (html: string) => html.match(/aria-pressed=/g)?.length ?? 0;

/** The winner question with the given tallies and the reader's own vote. */
const withCounts = (
  counts: { home: number; draw: number; away: number },
  mine: "home" | "draw" | "away" | null = null,
): MatchVotesDto => ({
  ...OPEN,
  questions: [
    { question: "winner", counts, mine },
    ...(OPEN as Extract<MatchVotesDto, { questions: unknown[] }>).questions.slice(1),
  ],
});

describe("NextMatchPick — the vote area (owner decision 2026-10-28: not a 1X2 slip)", () => {
  it("holds the vote area's place while the votes are not known, as the server renders it", async () => {
    const html = await render(pick());
    expect(html).toContain('data-testid="home-vote-hold"');
    expect(pressed(html)).toBe(0);
    // Hidden from assistive tech: nothing to read or press yet.
    expect(html).toMatch(/aria-hidden="true"[^>]*data-testid="home-vote-hold"/);
    expect(html).toContain("invisible");
  });

  it("asks 'Votre favori ?' with the two clubs as the vote targets and the draw as quiet text", async () => {
    const html = await render(pick(), OPEN);
    expect(html).not.toContain("home-vote-hold");
    expect(html).toContain(fr["home.pick.title"]);
    expect(html).not.toContain(fr["predictions.votes.winner"]);
    // Two clubs and the draw: three controls, but never a row of three equal pills.
    expect(pressed(html)).toBe(3);
    expect(html).not.toContain("grid-cols-3");
    const buttons = [...html.matchAll(/<button [^>]*aria-pressed[^>]*>(.*?)<\/button>/g)];
    expect(buttons).toHaveLength(3);
    expect(buttons[0]![0]).toContain("UTS Rabat");
    expect(buttons[2]![0]).toContain(fr["predictions.votes.draw"]);
    expect(buttons[2]![0]).not.toContain("border-[color");
    expect(buttons[2]![0]).not.toContain("rounded-full");
    // Home's club is on the start side, away on the end side, the draw under them.
    expect(html.indexOf("UTS Rabat")).toBeLessThan(html.indexOf("RSB Berkane"));
    // Every control is at least a tap target tall.
    for (const [button] of buttons) expect(button).toContain("min-h-[var(--ui-tap-min)]");
  });

  it("shows no result before the reader has voted", async () => {
    const html = await render(pick(), withCounts({ home: 52, draw: 14, away: 34 }));
    expect(html).toContain('data-revealed="false"');
    expect(html).not.toMatch(/52\s%/);
  });

  it("after a vote, shows the split as a bar in the clubs' colours with percentages", async () => {
    const html = await render(pick(), withCounts({ home: 52, draw: 14, away: 34 }, "home"));
    expect(html).toContain('data-revealed="true"');
    expect(html).toMatch(/52\s%/);
    expect(html).toMatch(/34\s%/);
    expect(html).toMatch(/14\s%/);
    // The bar's two club segments carry the club layer (`data-club`), the draw a neutral.
    const bar = html.slice(html.indexOf('data-testid="home-vote-bar"'));
    expect(bar.match(/data-club=""/g)).toHaveLength(2);
    expect(bar).toContain("flex:52 1 0");
    expect(bar).toContain("flex:14 1 0");
    expect(bar).toContain("flex:34 1 0");
    // The reader's choice is the pressed one.
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*UTS Rabat/s);
  });

  it("shows no percentage under the match page's threshold of votes, even after a vote", async () => {
    const html = await render(pick(), withCounts({ home: 5, draw: 2, away: 3 }, "home"));
    expect(html).toContain('data-revealed="false"');
    expect(html).not.toMatch(/\d\s%/);
  });

  it("closes the area when there is no vote to cast", async () => {
    const html = await render(pick(), OFF);
    expect(html).not.toContain("home-vote-hold");
    expect(html).not.toContain("home-vote-split");
    expect(pressed(html)).toBe(0);
    expect(html).not.toContain(fr["home.pick.title"]);
  });

  it("draws no vote area at all when the caller offers none, nor for a match under way", async () => {
    const html = await render(pick({ withVote: false }));
    expect(html).not.toContain("home-vote-hold");
    expect(pressed(html)).toBe(0);
    const live = await render(pick({ match: { ...MATCH, status: "live" } }), OPEN);
    expect(pressed(live)).toBe(0);
  });

  it("holds nothing when the caller expects no vote, and still shows votes once read", async () => {
    const html = await render(pick({ holdVote: false }));
    expect(html).not.toContain("home-vote-hold");
    expect(pressed(html)).toBe(0);
    expect(pressed(await render(pick({ holdVote: false }), OPEN))).toBe(3);
  });

  it("tells the caller when a read finds the game closed (or fails), as it is true of every match", () => {
    const source = readFileSync(join(import.meta.dir, "NextMatchPick.tsx"), "utf8");
    expect(source).toContain("wanted && (dto ? !dto.allowed : votes.failed)");
    expect(source).toMatch(/if \(gameClosed\) onGameClosed\?\.\(\);/);
    expect(source).toContain("holding: hold && !view && votes.pending");
  });

  it("waiting to read the votes holds the area, and shows votes it has already read", async () => {
    expect(await render(pick({ votesEnabled: false }))).toContain("home-vote-hold");
    expect(pressed(await render(pick({ votesEnabled: false }), OPEN))).toBe(3);
  });

  it("casts the same 'winner' vote as the match page", () => {
    const source = readFileSync(join(import.meta.dir, "NextMatchPick.tsx"), "utf8");
    expect(source).toContain('votes.cast("winner", choice)');
    expect(source).toContain("useMatchVotes(match.id");
  });
});

describe("NextMatchPick — the kick-off line", () => {
  it("holds the countdown's two lines empty in the server render, so nothing moves when it fills", async () => {
    const html = await render(pick());
    expect(html).toMatch(/data-testid="home-kickoff-countdown" data-state="pending"/);
  });

  it("shows the kickoff time, the link to the match page and the weekday", async () => {
    const html = await render(pick());
    expect(html).toContain(`href="/matches/${MATCH.id}"`);
    expect(html).toContain("16:00");
  });

  it("shows the score of a match under way or over, from the data the card already has", async () => {
    const live = await render(
      pick({ match: { ...MATCH, status: "live", homeScore: 2, awayScore: 1 } }),
    );
    expect(live).toContain('data-state="live"');
    expect(live).toContain("<bdi>2</bdi>");
    expect(live).not.toContain("16:00");
    const done = await render(
      pick({ match: { ...MATCH, status: "finished", homeScore: 0, awayScore: 0 } }),
    );
    expect(done).toContain('data-state="finished"');
    expect(done).toContain(fr["matches.status.finished"]);
  });
});

describe("NextMatchPick — in the band's carousel", () => {
  it("keeps today's top margin on its own, and fills its slide in the carousel", async () => {
    const alone = await render(pick());
    const slide = await render(pick({ fill: true }));
    expect(alone).toMatch(/class="relative p-3 mt-5 [^"]*" data-testid="home-next-match"/);
    expect(slide).toMatch(
      /class="relative p-3 flex flex-1 flex-col [^"]*" data-testid="home-next-match"/,
    );
    expect(slide).not.toMatch(/class="relative p-3 mt-5/);
  });
});
