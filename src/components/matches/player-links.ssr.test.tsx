import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

import type { MatchLineupDto } from "@/backend/football/contracts";
import { ClubSquad } from "@/components/clubs/ClubSquad";
import { I18nProvider } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import type { SquadPlayer } from "@/lib/club-season";
import type { Club } from "@/types/domain";
import { LineupsView } from "./LineupsView";

/**
 * U1 — a player's name in a line-up or a club squad opens his page when the
 * Fantasy pool lists him, and is plain text when it does not. Rendered inside a
 * router, because a link needs one.
 */

async function withRouter(node: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

const club = (id: string, name: string, code: string): Club => ({
  id,
  slug: id,
  name: { fr: name, ar: name },
  shortName: { fr: code, ar: code },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: code,
});
const wydad = club("war", "Wydad AC", "WAC");
const far = club("asfar", "AS FAR", "FAR");
const palettes = clubMatchPalettes(wydad, far);

// Fantasy player ids by football player id: "war-2" and "asfar-1" are in the pool.
const LINKS: Record<string, string> = { "war-2": "fantasy-war-2", "asfar-1": "fantasy-asfar-1" };
const playerLink = (id: string) => LINKS[id] ?? null;

const side = (teamId: string, withFormation: boolean) =>
  ({
    id: `lineup-${teamId}`,
    team: { id: teamId },
    formation: withFormation ? "4-3-3" : null,
    confirmed: true,
    publishedAt: null,
    players: [
      ["GK Un", "goalkeeper", "starting"],
      ["Joueur Deux", "defender", "starting"],
      ["Remplaçant Trois", "midfielder", "bench"],
    ].map(([displayName, position, slot], index) => ({
      id: `${teamId}-${index + 1}`,
      slug: `slug-${teamId}-${index + 1}`,
      displayName,
      slot,
      position,
      shirtNumber: index + 1,
      order: index + 1,
      captain: false,
    })),
  }) as unknown as MatchLineupDto;

const render = (lineups: MatchLineupDto[], link?: typeof playerLink) =>
  withRouter(
    <LineupsView
      lineups={lineups}
      home={wydad}
      away={far}
      palettes={palettes}
      phase="live"
      playerLink={link}
    />,
  );

describe("line-ups: names open the player page", () => {
  it("links the rows whose player is in the Fantasy pool, and only those", async () => {
    // No formation, so the list form: one row per starter and one pill per substitute.
    const html = await render([side("war", false), side("asfar", false)], playerLink);
    expect(html).toContain('href="/fantasy/players/fantasy-war-2"');
    expect(html).toContain('href="/fantasy/players/fantasy-asfar-1"');
    expect(html.match(/href="\/fantasy\/players\//g)).toHaveLength(2);
    // The unlinked rows are still there, as text.
    expect(html).toContain("Remplaçant Trois");
    expect(html).toContain("GK Un");
  });

  it("makes the whole row a 44px target in the list form", async () => {
    const html = await render([side("war", false), side("asfar", false)], playerLink);
    const link = /<a [^>]*href="\/fantasy\/players\/fantasy-war-2"[^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain("min-h-[var(--ui-tap-min)]");
  });

  it("draws no link without a mapping, in either form", async () => {
    for (const formation of [false, true]) {
      const html = await render([side("war", formation), side("asfar", formation)]);
      expect(html).not.toContain("/fantasy/players/");
    }
  });

  it("links the pitch discs too, but not as tab stops (the pitch is a picture)", async () => {
    const html = await render([side("war", true), side("asfar", true)], playerLink);
    const pitchLinks = html.match(/<a [^>]*href="\/fantasy\/players\/[^"]*"[^>]*>/g) ?? [];
    expect(pitchLinks.length).toBeGreaterThan(0);
    for (const link of pitchLinks.filter((l) => l.includes("absolute"))) {
      expect(link).toContain('tabindex="-1"');
    }
  });
});

describe("club squad: names open the player page", () => {
  const player = (id: string, name: string): SquadPlayer => ({
    id,
    name,
    position: "midfielder",
    shirtNumber: 8,
    role: "player",
  });
  const squad = {
    data: [player("p-linked", "Joueur Lié"), player("p-plain", "Joueur Seul")],
    isPending: false,
    isError: false,
    refetch: () => undefined,
  };

  it("links a row whose player is in the pool, with a 56px minimum row", async () => {
    const html = await withRouter(
      <ClubSquad
        club={wydad}
        squad={squad}
        playerLink={(id) => (id === "p-linked" ? "fantasy-linked" : null)}
      />,
    );
    expect(html).toContain('href="/fantasy/players/fantasy-linked"');
    expect(html.match(/href="\/fantasy\/players\//g)).toHaveLength(1);
    const link = /<a [^>]*href="\/fantasy\/players\/fantasy-linked"[^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain("min-h-[var(--ui-row-min)]");
    expect(html).toContain("Joueur Seul");
  });

  it("is plain text everywhere without a mapping", async () => {
    const html = await withRouter(<ClubSquad club={wydad} squad={squad} />);
    expect(html).not.toContain("/fantasy/players/");
    expect(html).toContain("Joueur Lié");
  });
});
