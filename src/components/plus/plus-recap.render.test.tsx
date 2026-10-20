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
import { toRoundRecapView, type RoundRecapView } from "@/backend/premium/round-recap";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { premiumRoundRecapService } from "@/services/premium-round-recap";
import { premiumRecapKeys } from "@/services/use-premium-round-recap";

import { PlusRecapSection } from "./PlusRecapSection";
import { EXAMPLE_RECAP_J11 } from "./plus-recap-example";

const { fr, ar } = dictionaries;

async function render(node: ReactElement, client = new QueryClient()): Promise<string> {
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
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const standing = { totalScore: 612, rank: 3, size: 5 };
const LEAGUE = EXAMPLE_RECAP_J11.league!.id;

/** A member whose figures appear nowhere in the example journée. */
function distinctView(): RoundRecapView {
  return toRoundRecapView({
    ...EXAMPLE_RECAP_J11,
    me: { ...EXAMPLE_RECAP_J11.me, score: 301, startingPoints: 297, captainBonus: 8 },
    players: EXAMPLE_RECAP_J11.players.map((p) =>
      p.name === "Haddad" ? { ...p, name: "Joueur Secret" } : p,
    ),
  });
}

describe("« Votre journée expliquée » on the card page", () => {
  it("feature off: nothing, no node and no request", async () => {
    let calls = 0;
    const original = premiumRoundRecapService.roundRecap;
    premiumRoundRecapService.roundRecap = (async () => {
      calls++;
      return { available: false };
    }) as typeof original;
    try {
      const html = await render(<PlusRecapSection access="off" leagueId={LEAGUE} />);
      expect(html).not.toContain("plus-recap");
      expect(calls).toBe(0);
    } finally {
      premiumRoundRecapService.roundRecap = original;
    }
  });

  it("non-member: real points and position clear, the example blurred and inert, one unlock, no request", async () => {
    let calls = 0;
    const original = premiumRoundRecapService.roundRecap;
    premiumRoundRecapService.roundRecap = (async () => {
      calls++;
      return { available: false };
    }) as typeof original;
    try {
      const html = await render(<PlusRecapSection access="locked" standing={standing} />);
      const visible = text(html);
      expect(html).toContain('data-testid="plus-recap-locked"');
      expect(html).toContain('data-testid="plus-real-points"');
      expect(visible).toContain("612");
      expect(visible).toContain("3e sur 5");
      expect(visible).toContain(fr["plus.recap.locked_title"]);
      expect(visible).toContain(fr["plus.in.unlock"]);
      expect(html).toContain('href="/curva/plus?step=3&amp;via=season"');
      expect(html).toMatch(/class="pl-under[^"]*" aria-hidden="true" inert=""/);
      // The head is outside the blur; the example is under it.
      expect(html.indexOf("plus-real-points")).toBeLessThan(html.indexOf("pl-under"));
      expect(html.indexOf("pl-under")).toBeLessThan(html.indexOf("plus-recap-pitch"));
      expect(calls).toBe(0);
    } finally {
      premiumRoundRecapService.roundRecap = original;
    }
  });

  it("non-member: nothing of a member's paid read is in the markup, even from the cache", async () => {
    const client = new QueryClient();
    client.setQueryData(premiumRecapKeys.recap(null, LEAGUE, null), distinctView());
    const html = await render(
      <PlusRecapSection access="locked" standing={standing} leagueId={LEAGUE} />,
      client,
    );
    expect(html).not.toContain("Joueur Secret");
    expect(html).not.toContain(">301<");
  });

  it("member: the journée on the pitch, in words that keep the rules", async () => {
    const client = new QueryClient();
    client.setQueryData(
      premiumRecapKeys.recap(null, LEAGUE, null),
      toRoundRecapView(EXAMPLE_RECAP_J11),
    );
    const html = await render(
      <PlusRecapSection access="member" leagueId={LEAGUE} teamName="Karim B." />,
      client,
    );
    const visible = text(html);
    expect(html).toContain('data-testid="plus-recap"');
    expect(html).not.toContain("pl-lock");
    expect(html).not.toContain("inert");
    expect(visible).toContain("Journée 11 : 75 pts, 9 de plus que la moyenne de votre ligue");
    expect(html.match(/data-testid="plus-recap-chip"/g)).toHaveLength(11);
    expect(html).toContain('data-testid="plus-recap-cause-captain"');
    expect(html).toContain('data-testid="plus-recap-cause-transfer"');
    expect(html).toContain('data-testid="plus-recap-cause-others"');
    expect(html).toContain('data-testid="plus-recap-share"');
    // A player not scored yet says so; the score waits; nothing says « provisoire ».
    expect(visible).toContain(fr["plus.recap.waiting"]);
    expect(visible).toContain("Ayoub Nanah : note en attente");
    expect(visible.toLowerCase()).not.toContain("provisoire");
    expect(visible).not.toContain("NaN");
    // No absence list is invented: the screen says there is none.
    expect(visible).toContain(fr["plus.recap.absences"]);
    expect(visible).toContain("Moyenne de votre ligue privée (5 managers)");
    // The scoring version remains available for diagnostics, outside the user's explanation.
    expect(html).toContain('data-calculation-version="4"');
    expect(visible).not.toContain("Calcul v");
    // No serial number of a card.
    expect(visible).not.toMatch(/n°\s*\d|BOT\s*#/);
  });

  it("member: a loading state while the read is in flight, an empty one without a journée", async () => {
    const loading = await render(<PlusRecapSection access="member" leagueId={LEAGUE} />);
    expect(loading).toContain("pl-skeleton");
    expect(text(loading)).toContain(fr["plus.recap.loading"]);
  });

  it("member: a league under three managers shows the score without an average or a gap", async () => {
    const client = new QueryClient();
    const small = toRoundRecapView({
      ...EXAMPLE_RECAP_J11,
      gameweek: { ...EXAMPLE_RECAP_J11.gameweek, corrected: true },
      leagueFigures: { scored: 2, average: null, best: 81, settled: false, captainAverage: null },
      explain: {
        ...EXAMPLE_RECAP_J11.explain,
        vsLeague: null,
        others: null,
        captain: { ...EXAMPLE_RECAP_J11.explain.captain!, vsLeague: null },
      },
    });
    client.setQueryData(premiumRecapKeys.recap(null, LEAGUE, null), small);
    const html = await render(<PlusRecapSection access="member" leagueId={LEAGUE} />, client);
    const visible = text(html);
    expect(visible).toContain("Journée 11 : 75 pts");
    expect(visible).not.toContain("de plus que la moyenne");
    expect(visible).toContain(fr["plus.recap.small_league"]);
    expect(visible).toContain(fr["plus.recap.corrected"]);
    expect(html).not.toContain('data-testid="plus-recap-cause-others"');
  });
});

describe("the copy", () => {
  it("has the same keys and placeholders in French and Arabic, Arabic written in Arabic script", () => {
    const keys = Object.keys(fr).filter((key) => key.startsWith("plus.recap."));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      const k = key as keyof typeof fr;
      expect(ar[k]).toBeTruthy();
      const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(holes(ar[k])).toEqual(holes(fr[k]));
    }
  });

  it("never says « provisoire » or the banned words", () => {
    const banned = /provisoire|débloquer|premium|pass\b|membre|مؤقت/i;
    for (const key of Object.keys(fr).filter((k) => k.startsWith("plus.recap."))) {
      const k = key as keyof typeof fr;
      expect(`${fr[k]} ${ar[k]}`).not.toMatch(banned);
    }
  });
});
