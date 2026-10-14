import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { MatchCard } from "@/components/common/MatchCard";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import { matchDayKey } from "@/lib/match-kickoff";
import type { Club, Match } from "@/types/domain";
import { HeadToHead } from "./HeadToHead";
import { LiveStrip } from "./LiveStrip";
import { MatchdayStrip } from "./MatchdayStrip";
import { MatchScoreHeader } from "./MatchScoreHeader";
import { MatchTopBar } from "./MatchTopBar";

/**
 * A live match whose score the provider has not sent is not 0–0
 * (audit 2026-10-14, DATA-03): a dash on screen, "score unavailable" for a
 * screen reader, and a real 0–0 unchanged.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;

const club = (id: string, name: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: name, ar: name },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: id.toUpperCase(),
});
const fus = club("fus", "FUS");
const raja = club("rca", "Raja");
const palettes = clubMatchPalettes(fus, raja);

const live: Match = {
  id: "m1",
  gameweek: 4,
  homeClubId: "fus",
  awayClubId: "rca",
  kickoff: "2026-10-13T20:00:00.000Z",
  status: "live",
  minute: 25,
  venue: { fr: "Stade", ar: "Stade" },
};
const unknown: Match = live;
const goalless: Match = { ...live, homeScore: 0, awayScore: 0 };

async function render(node: ReactElement, queryClient = new QueryClient()): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const UNAVAILABLE = fr["matches.a11y.score_unavailable"]
  .replace("{home}", "FUS")
  .replace("{away}", "Raja");

describe("the score header", () => {
  const header = (match: Match) =>
    render(
      <MatchScoreHeader
        match={match}
        home={fus}
        away={raja}
        palettes={palettes}
        elapsed={25}
        headingId="h"
      />,
    );

  test("an unknown score is a dash, announced as unavailable, never 0–0", async () => {
    const html = await header(unknown);
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain("Score : FUS 0, Raja 0");
    expect(html).toMatch(/<bdi[^>]*>—<\/bdi>[^]*<bdi[^>]*>—<\/bdi>/);
    expect(html).not.toMatch(/<bdi[^>]*>0<\/bdi>/);
  });

  test("a real 0–0 is still 0–0", async () => {
    const html = await header(goalless);
    expect(html).toContain("Score : FUS 0, Raja 0");
    expect(html).toMatch(/<bdi[^>]*>0<\/bdi>[^]*<bdi[^>]*>0<\/bdi>/);
    expect(html).not.toContain(UNAVAILABLE);
  });
});

describe("the compact top bar", () => {
  const bar = (match: Match) =>
    render(
      <MatchTopBar
        onBack={() => {}}
        compact
        fixture={{ match, home: fus, away: raja, palettes, elapsed: 25 }}
      />,
    );

  test("shows a dash for an unknown score and 0 for a real zero", async () => {
    expect(await bar(unknown)).toContain("<bdi>—</bdi>");
    expect(await bar(unknown)).not.toContain("<bdi>0</bdi>");
    expect(await bar(goalless)).toContain("<bdi>0</bdi>");
  });
});

describe("the match card", () => {
  const card = (match: Match) => render(<MatchCard match={match} home={fus} away={raja} />);

  test("an unknown live score is a dash with an unavailable label", async () => {
    const html = await card(unknown);
    expect(html).toContain(`aria-label="${UNAVAILABLE} — `);
    expect(html).not.toContain("Score : FUS 0, Raja 0");
    expect(html).not.toMatch(/<bdi[^>]*>0<\/bdi>/);
    expect(html).toMatch(/<bdi[^>]*>—<\/bdi>/);
  });

  test("a real 0–0 keeps its label", async () => {
    const html = await card(goalless);
    expect(html).toContain('aria-label="Score : FUS 0, Raja 0 — ');
    expect(html).toMatch(/<bdi[^>]*>0<\/bdi>/);
  });
});

describe("the live strip", () => {
  const strip = (match: Match) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["football", "live-matches", "fr"], {
      matches: [match],
      clubs: [fus, raja],
    });
    return render(<LiveStrip />, queryClient);
  };

  test("an unknown score is a dash, labelled unavailable", async () => {
    const html = await strip(unknown);
    expect(html).toContain(`aria-label="${UNAVAILABLE}`);
    expect(html).not.toMatch(/<bdi[^>]*>0<\/bdi>/);
    expect(html).toMatch(/<bdi[^>]*>—<\/bdi>/);
  });

  test("a real 0–0 stays 0–0", async () => {
    const html = await strip(goalless);
    expect(html).toContain('aria-label="Score : FUS 0, Raja 0');
    expect(html).toMatch(/<bdi[^>]*>0<\/bdi>/);
  });
});

describe("the matchday strip", () => {
  const strip = (match: Match) => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["football", "matches", matchDayKey(new Date()), "default", "fr"], {
      matches: [match],
      clubs: [fus, raja],
    });
    return render(<MatchdayStrip />, queryClient);
  };

  test("the link is named by the score sentence, never by dashes read out", async () => {
    expect(await strip(unknown)).toContain(`aria-label="${UNAVAILABLE}"`);
    expect(await strip(goalless)).toContain('aria-label="Score : FUS 0, Raja 0"');
    const scheduled = await strip({ ...live, status: "scheduled" });
    expect(scheduled).not.toContain('aria-label="Score');
    expect(scheduled).not.toContain("indisponible");
  });

  test("an unknown score is a dash, a real 0–0 is 0 – 0", async () => {
    expect(await strip(unknown)).toContain("— – —");
    expect(await strip(unknown)).not.toContain("0 – 0");
    expect(await strip(goalless)).toContain("0 – 0");
  });
});

describe("a past meeting", () => {
  test("is never announced as 0–0 when its score is missing", async () => {
    const meeting: Match = { ...live, id: "old", status: "finished" };
    const html = await render(
      <HeadToHead home={fus} away={raja} palettes={palettes} standings={[]} meetings={[meeting]} />,
    );
    expect(html).toContain(UNAVAILABLE);
    expect(html).not.toContain("Score : FUS 0, Raja 0");
  });
});

describe("the copy", () => {
  test("the unavailable sentence exists in both languages with both club slots", () => {
    for (const dictionary of [fr, ar]) {
      const sentence = dictionary["matches.a11y.score_unavailable"];
      expect(sentence).toContain("{home}");
      expect(sentence).toContain("{away}");
      expect(sentence).not.toContain("{hs}");
    }
    expect(fr["matches.a11y.score_unavailable"]).toContain("Score indisponible");
    expect(ar["matches.a11y.score_unavailable"]).toContain("النتيجة غير متوفرة");
  });
});
