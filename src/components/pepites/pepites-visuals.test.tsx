import { describe, expect, it } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PepitesPlayerCard } from "@/backend/pepites/contracts";
import { I18nProvider } from "@/i18n/provider";

import { bandFigures, playerFiguresLine, teamAsClub } from "./pepites-format";
import { PepitesIdentityDisc, RankPlate } from "./PepitesVisuals";
import { PercentileLegend, PercentileWheel } from "./PepitesWheel";

/**
 * The visuals BG-0156 adds to the Pépites rows and the featured N°1, on
 * rendered markup: the white rank plate, the disc's order (photo, crest,
 * initials), and the percentile wheel and its legend. The wheel's geometry
 * and its Arabic mirror are tested as pure helpers in pepites-design.test.ts.
 */

const render = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

const TEAM = {
  id: "9f8c170d-24ed-41a3-99ca-a06167fd9c8b",
  slug: "hassania-agadir-9f8c170d24ed",
  name: { fr: "Hassania Agadir", ar: "حسنية أكادير" },
  shortName: { fr: "Hassania Agadir", ar: "حسنية أكادير" },
};

const PLAYER: Pick<PepitesPlayerCard, "team" | "photo"> = { team: TEAM, photo: null };
const CREST = "https://example.supabase.co/storage/v1/object/public/football-media/teams/1.png";

describe("the rank plate", () => {
  it("sets ranks 1 to 3 on the white score plate, light in both themes", () => {
    for (const rank of [1, 2, 3]) {
      const html = render(<RankPlate rank={rank} />);
      expect(html).toContain("data-podium");
      expect(html).toContain("bg-[color:var(--ui-scorebox)]");
      expect(html).toContain("text-[color:var(--ui-on-scorebox)]");
      expect(html).toContain(`<bdi>${rank}</bdi>`);
    }
  });

  it("rings the plate on a card, where plate and card are the same white, and keeps it flat on the band", () => {
    expect(render(<RankPlate rank={1} />)).toContain("ring-[color:var(--ui-rule)]");
    expect(render(<RankPlate rank={1} />)).toContain("shadow-[var(--ui-shadow-card)]");
    // The One Lift Rule (DESIGN.md): the lifted shadow on the band is the
    // score plate's; the white rank plate beside it sits flat.
    const band = render(<RankPlate rank={1} onBand />);
    expect(band).toContain("bg-[color:var(--ui-scorebox)]");
    expect(band).not.toContain("shadow-[");
    expect(band).not.toContain("ring-[color:var(--ui-rule)]");
  });

  it("prints 4 and below as a muted figure in the same box, and a dash for no rank", () => {
    const fourth = render(<RankPlate rank={4} />);
    expect(fourth).not.toContain("data-podium");
    expect(fourth).not.toContain("--ui-scorebox");
    expect(fourth).toContain("text-[color:var(--ui-on-surface-muted)]");
    expect(render(<RankPlate rank={10} onBand />)).toContain("text-[color:var(--ui-on-ink-muted)]");
    expect(render(<RankPlate rank={null} />)).toContain("<bdi>–</bdi>");
    // Every size keeps one box, so a column of ranks lines up.
    expect(render(<RankPlate rank={4} size="sm" />)).toContain("min-w-7");
    expect(render(<RankPlate rank={1} size="sm" />)).toContain("min-w-7");
  });
});

describe("the identity disc", () => {
  it("shows the player's photo when the read returned one", () => {
    // The photo's address is built on the project's storage origin.
    const before = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    try {
      const html = render(
        <PepitesIdentityDisc
          player={{
            team: TEAM,
            photo: {
              assetId: "0f0e7a5c-29b1-4a43-8d0a-9d6b9a1c1d11",
              storagePath: "football/players/1/photo.webp",
            },
          }}
          listed={{ crestUrl: CREST, crestPlaceholder: "HUSA" }}
        />,
      );
      expect(html).toContain('data-photo-state="photo"');
      expect(html).toContain("players/1/photo.webp");
      expect(html).not.toContain(CREST);
    } finally {
      if (before === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = before;
    }
  });

  it("shows the club's crest from the catalogue when there is no photo", () => {
    const html = render(
      <PepitesIdentityDisc
        player={PLAYER}
        listed={{ crestUrl: CREST, crestPlaceholder: "HUSA" }}
      />,
    );
    expect(html).not.toContain("data-photo-state");
    expect(html).toContain(CREST);
    // The catalogue's short code sits under the crest, for a load failure.
    expect(html).toContain(">HUSA<");
    expect(html).toContain('aria-hidden="true"');
  });

  it("falls back to the club-colour disc with the club's initials without the catalogue", () => {
    const html = render(<PepitesIdentityDisc player={PLAYER} />);
    // Hassania's code in the club table, as on every other crest.
    expect(html).toContain(">HUSA<");
    expect(html).toContain("bg-[color:var(--ui-club)]");
    expect(html).not.toContain("<img");
  });

  it("gives a player without a club the silhouette", () => {
    const html = render(<PepitesIdentityDisc player={{ team: null, photo: null }} />);
    expect(html).toContain('data-photo-state="silhouette"');
  });

  it("joins a team to its catalogue entry by crest and code, keeping the Pépites palette key", () => {
    const club = teamAsClub(TEAM, { crestUrl: CREST, crestPlaceholder: "HUSA" })!;
    expect(club.crestUrl).toBe(CREST);
    expect(club.crestPlaceholder).toBe("HUSA");
    expect(club.slug).toBe(TEAM.slug);
    const bare = teamAsClub(TEAM)!;
    expect(bare.crestUrl).toBeUndefined();
    // A current club takes its code from the club table either way.
    expect(bare.crestPlaceholder).toBe("HUSA");
    // A former club, outside the table: three letters of its name, and a
    // blank catalogue code does not blank the disc.
    const SAFI = {
      id: "32fb7b61-9af4-4667-8978-b739b5e3f170",
      slug: "olympic-safi-32fb7b619af4",
      name: { fr: "Olympic Safi", ar: "أولمبيك أسفي" },
      shortName: { fr: "Olympic Safi", ar: "أولمبيك أسفي" },
    };
    expect(teamAsClub(SAFI)!.crestPlaceholder).toBe("OLY");
    expect(teamAsClub(SAFI, { crestPlaceholder: "  " })!.crestPlaceholder).toBe("OLY");
  });
});

describe("the percentile wheel and its legend", () => {
  const PERCENTILES = [96, 95, 97, 44, null] as const;

  it("draws five tracks and a value slice for every known part above zero", () => {
    const html = render(<PercentileWheel percentiles={PERCENTILES} />);
    expect(html.match(/data-slice="/g)).toHaveLength(5);
    expect(html.match(/data-value=""/g)).toHaveLength(4);
    expect(html.match(/fill="var\(--ui-ink\)"/g)).toHaveLength(5);
    // The values in the action gradient: the two stops, turf over sky.
    expect(html).toContain("stop-color:var(--ui-accent-spring)");
    expect(html).toContain("stop-color:var(--ui-accent-sky)");
    expect(render(<PercentileWheel percentiles={[0, 0, 0, 0, 0]} />)).not.toContain("data-value");
  });

  it("is decorative: the legend prints every figure, a dash for an unknown part", () => {
    const wheel = render(<PercentileWheel percentiles={PERCENTILES} />);
    expect(wheel).toContain('aria-hidden="true"');
    const legend = render(<PercentileLegend percentiles={PERCENTILES} />);
    for (const label of ["Note moyenne", "Forme", "Contribution", "Progression", "Temps de jeu"]) {
      expect(legend).toContain(label);
    }
    expect(legend).toContain("<bdi");
    expect(legend).toMatch(/>96<\/bdi>/);
    expect(legend).toMatch(/>44<\/bdi>/);
    expect(legend).toMatch(/>–<\/bdi>/);
    expect(legend).toContain("Percentiles · vs les U23 classés");
  });
});

describe("the row's figures line", () => {
  it("prints minutes, then goals and assists, with the figures isolated", () => {
    const t = (key: string) => ({ "pepites.meta.goals_assists": "{g}B {a}PD" })[key] ?? key;
    const line = playerFiguresLine(
      { minutes: 2087, goals: 16, assists: 1 },
      {
        t: t as never,
        lang: "fr",
      },
    );
    // French groups thousands with a narrow no-break space (`formatCount`).
    expect(line.replace(/[⁨⁩]/g, "")).toBe("2\u202f087’\u00a0· 16B 1PD");
    expect(line).toContain("⁨16⁩");
  });
});

describe("the featured N°1's figures", () => {
  const ROW = { minutes: 2087, goals: 16, assists: 1, ratingAvg: 6.9, ga90: 0.73 };
  const SCORE = {
    minutes: 1990,
    goals: 15,
    assists: 2,
    ratingAvg: 6.84,
    per90: { goalsAssists: 0.7688, cleanSheets: null },
  };

  it("prints the ranking's row first", () => {
    expect(bandFigures(ROW, SCORE, false)).toEqual(ROW);
    expect(bandFigures(ROW, null, true)).toEqual(ROW);
  });

  it("waits while the ranking loads, so a figure never changes under the reader", () => {
    expect(bandFigures(undefined, SCORE, true)).toBeUndefined();
  });

  it("falls back to the player's own read once the ranking has settled without the player", () => {
    // An editor's N°1 ranked below the fifty-row read, or a failed ranking read.
    expect(bandFigures(undefined, SCORE, false)).toEqual({
      minutes: 1990,
      goals: 15,
      assists: 2,
      ratingAvg: 6.84,
      ga90: 0.7688,
    });
    expect(
      bandFigures(undefined, { ...SCORE, per90: { cleanSheets: null } }, false)?.ga90,
    ).toBeNull();
  });

  it("has nothing when neither read has the player, so the band leaves the row out", () => {
    expect(bandFigures(undefined, null, false)).toBeUndefined();
  });
});

describe("the featured band's club edge", () => {
  it("meets the navy on its inner side, never the veiled photo", async () => {
    // The edge is lifted to 3:1 against Tunnel Navy (shareClubColours, tested
    // for every kit in share-image.draw.test.ts), but the veiled stadium photo
    // is lighter in places: a mid red fell to 1.8:1 against it. A 2px navy
    // keyline keeps the navy beside the edge whatever the photo does.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./PepitesFeature.tsx", import.meta.url), "utf8");
    const edge = /<span[^>]*data-testid="pepites-feature-edge"[^>]*className="([^"]+)"/.exec(
      source,
    );
    expect(edge?.[1]).toContain("box-content w-1 border-e-2 border-[color:var(--ui-ink-deep)]");
    expect(source).toContain(
      "shareClubColours(teamKit(player.team).primary, SHARE_PALETTE.ground).edge",
    );
  });
});
