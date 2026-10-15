import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { AuthProvider } from "@/auth/AuthProvider";
import type {
  MatchVoteChoice,
  MatchVotesDto,
  OpenPredictionsRoundDto,
  PredictionFixtureDto,
} from "@/backend/predictions/contracts";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { questionView } from "./match-votes";
import { MatchPredictionCard } from "./MatchPredictionCard";
import { MatchVoteCard } from "./MatchVoteCard";
import { matchVotesKey } from "./use-match-votes";
import { predictionsKeys } from "./use-predictions-round";

/**
 * The fan votes on a match page read as a supporters' poll, never as a
 * betting slip (critique of 2026-10-06, P1 "Fan vote reads as a betting
 * slip"): every answer written out in words — the clubs' names, "Match nul",
 * "Aucun but" — with no crest standing for a club and no "X" for a draw, no
 * "Votez !", and the votes under their own heading, apart from "Votre
 * pronostic". Rendered with `react-dom/server` in French, like the other
 * component tests; the Arabic copy is checked in the dictionary.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;

const FIXTURE_ID = "00000020-0000-4000-8000-000000000001";
const team = (id: string, name: string, shortName: string) => ({
  id,
  slug: id,
  name,
  shortName,
  code: null,
  city: null,
  countryCode: null,
  crestUrl: null,
  crestPath: null,
  primaryColor: null,
  secondaryColor: null,
  active: true,
});
const fixture = (over: Partial<PredictionFixtureDto> = {}): PredictionFixtureDto => ({
  id: FIXTURE_ID,
  kickoffAt: "2099-10-08T15:00:00.000Z",
  kickoffConfirmed: true,
  status: "scheduled",
  open: true,
  home: team("uts", "Union Touarga Sport", "UTS Rabat"),
  away: team("rsb", "Renaissance Sportive de Berkane", "RSB Berkane"),
  live: null,
  result: null,
  final: false,
  void: false,
  corrected: false,
  ...over,
});

const winner = (counts = { home: 0, draw: 0, away: 0 }, mine: MatchVoteChoice | null = null) =>
  questionView({ question: "winner", counts, mine } as never);
const firstGoal = (counts = { home: 0, none: 0, away: 0 }, mine: MatchVoteChoice | null = null) =>
  questionView({ question: "first_goal", counts, mine } as never);
const bothScore = (counts = { yes: 0, no: 0 }, mine: MatchVoteChoice | null = null) =>
  questionView({ question: "both_score", counts, mine } as never);

function card(
  view: ReturnType<typeof questionView>,
  { open = true, match = fixture() }: { open?: boolean; match?: PredictionFixtureDto } = {},
): string {
  return renderToString(
    <I18nProvider>
      <MatchVoteCard fixture={match} view={view} open={open} onVote={() => {}} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

/** What each answer shows, in order, without its screen-reader text. */
const faces = (html: string): string[] =>
  [...html.matchAll(/data-choice="[^"]+"[^>]*>(.*?)<\/(?:button|li)>/g)].map((m) =>
    m[1]!
      .replace(/<span class="sr-only[^"]*">.*?<\/span>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

describe("MatchVoteCard — answers in words, not 1 / X / 2", () => {
  it("asks who wins with the two clubs' names and « Match nul », and no X", () => {
    const html = card(winner());
    expect(faces(html)).toEqual(["UTS Rabat", fr["predictions.votes.draw"], "RSB Berkane"]);
    expect(faces(html)).not.toContain("X");
    // No crest stands for a club inside an answer.
    expect(html).not.toContain("<img");
    // Each answer is still a button with the name it always had.
    expect(html).toContain('aria-label="Victoire de UTS Rabat"');
    expect(html).toContain(`aria-label="${fr["predictions.votes.draw"]}"`);
    expect(html.match(/<button[^>]+aria-pressed=/g)).toHaveLength(3);
  });

  it("asks who scores first with the names and « Aucun but », not crests and an icon", () => {
    const html = card(firstGoal());
    expect(faces(html)).toEqual(["UTS Rabat", fr["predictions.votes.no_goal"], "RSB Berkane"]);
    expect(html).not.toContain("lucide-ban");
  });

  it("writes yes and no in the same style as the other answers", () => {
    const html = card(bothScore());
    expect(faces(html)).toEqual([fr["predictions.votes.yes"], fr["predictions.votes.no"]]);
    expect(html).not.toContain("uppercase");
  });

  it("names a club as Home's band does: the full name when the short one is only a code", () => {
    const wydad = fixture({ away: team("wac", "Wydad AC", "WCA") });
    expect(faces(card(winner(), { match: wydad }))).toEqual([
      "UTS Rabat",
      fr["predictions.votes.draw"],
      "Wydad AC",
    ]);
  });

  it("lets the question stand alone before a vote: no « Votez ! »", () => {
    const html = card(winner());
    expect(html).toContain(fr["predictions.votes.winner"]);
    expect(html).not.toMatch(/Votez/);
    expect("predictions.votes.cta" in fr).toBe(false);
    expect("predictions.votes.cta" in ar).toBe(false);
  });

  it("shows each answer's name over its share once the poll is closed", () => {
    const html = card(winner({ home: 412, draw: 198, away: 287 }), { open: false });
    expect(html).toContain(fr["predictions.votes.closed"]);
    expect(faces(html)).toEqual(["UTS Rabat 46 %", "Match nul 22 %", "RSB Berkane 32 %"]);
    expect(html.match(/<li [^>]*flex-col/g)).toHaveLength(3);
  });

  it("marks the reader's own answer and keeps the pencil while the match is open", () => {
    const html = card(winner({ home: 412, draw: 198, away: 287 }, "home"));
    expect(html).toContain('data-choice="home" data-mine="true"');
    expect(html).toContain(`aria-label="${fr["predictions.votes.edit"]}"`);
  });
});

describe("MatchVoteCard — copy in both languages", () => {
  it("gives the votes their own heading, and the deck a name for both groups", () => {
    expect(fr["predictions.votes.heading"]).toBe("L'avis des supporters");
    expect(ar["predictions.votes.heading"]).toBe("رأي المشجعين");
    expect(fr["predictions.votes.deck"]).toBe("Votre pronostic et l'avis des supporters");
    expect(ar["predictions.votes.deck"]).toBe("توقعك ورأي المشجعين");
    // The draw is Home's word for it, in both languages.
    expect(ar["predictions.votes.draw"]).toBe("تعادل");
    for (const key of ["predictions.votes.heading", "predictions.votes.deck"] as const) {
      expect(ar[key]).toMatch(/[؀-ۿ]/);
      expect(ar[key]).not.toBe(fr[key]);
    }
  });
});

const ROUND: OpenPredictionsRoundDto = {
  schemaVersion: 1,
  mode: "public",
  allowed: true,
  serverTime: "2026-10-07T10:00:00.000Z",
  season: null,
  round: {
    id: "00000030-0000-4000-8000-000000000003",
    number: 3,
    name: "Journée 3",
    state: "upcoming",
    provisional: false,
    nextLockAt: null,
    scoringVersion: 0,
  },
  rounds: [{ number: 3, state: "upcoming" }],
  fixtures: [fixture()],
};
const VOTES: MatchVotesDto = {
  schemaVersion: 1,
  allowed: true,
  serverTime: "2026-10-07T10:00:00.000Z",
  fixtureId: FIXTURE_ID,
  covered: true,
  open: true,
  questions: [
    { question: "winner", counts: { home: 5, draw: 2, away: 3 }, mine: null },
    { question: "both_score", counts: { yes: 1, no: 0 }, mine: null },
    { question: "first_goal", counts: { home: 0, none: 0, away: 0 }, mine: null },
  ],
};

async function deck(votes: MatchVotesDto | null): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(predictionsKeys.round(3, "fr"), ROUND);
  if (votes) client.setQueryData(matchVotesKey(FIXTURE_ID, ""), votes);
  const node = <MatchPredictionCard fixtureId={FIXTURE_ID} roundNumber={3} placement="inline" />;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{node}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  // React escapes the apostrophe of "L'avis"; read it back as typed.
  return renderToString(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  )
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
}

describe("MatchPredictionCard — the prediction and the votes under separate headings", () => {
  it("heads the score card « Votre pronostic » and the votes « L'avis des supporters »", async () => {
    const html = await deck(VOTES);
    // One heading per group, in reading order; the votes' heading comes after
    // the score card and before the first vote.
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual([fr["predictions.match.title"], fr["predictions.votes.heading"]]);
    const at = (needle: string) => html.indexOf(needle);
    expect(at(`data-testid="prediction-${FIXTURE_ID}"`)).toBeLessThan(
      at(`>${fr["predictions.votes.heading"]}</h2>`),
    );
    expect(at(`>${fr["predictions.votes.heading"]}</h2>`)).toBeLessThan(
      at('data-testid="match-vote-winner"'),
    );
    // Above the next two votes the same words show, for the eye only.
    expect(
      html.match(
        new RegExp(
          `<p aria-hidden="true" class="[^"]+">${fr["predictions.votes.heading"]}</p>`,
          "g",
        ),
      ),
    ).toHaveLength(2);
    // Four cards, one deck, its name covering both groups.
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(4);
    expect(html).toContain(`aria-label="${fr["predictions.votes.deck"]}"`);
  });

  it("keeps « Votre pronostic » alone when there are no votes to show", async () => {
    const html = await deck(null);
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual([fr["predictions.match.title"]]);
    expect(html).not.toContain(fr["predictions.votes.heading"]);
  });
});
