import { describe, expect, it } from "bun:test";

import type { PepitesEdition, PepitesPlayerCard } from "@/backend/pepites/contracts";

import { shareImageModel, sharePhotoUrl, splitName, storyModel } from "./share-image";

function card(n: number, scope?: "in_app" | "in_app_and_social"): PepitesPlayerCard {
  return {
    id: `7e500000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Joueur ${n}`,
    positionGroup: "MID",
    age: 20,
    team: {
      id: "7e600000-0000-4000-8000-000000000001",
      name: { fr: "Club", ar: "النادي" },
      shortName: { fr: "CLB", ar: "ن" },
    },
    score: 90 - n,
    rank: n,
    photo: scope
      ? {
          assetId: "7e700000-0000-4000-8000-000000000001",
          storagePath: `football/players/p${n}.webp`,
          scope,
        }
      : null,
  };
}

function edition(status: PepitesEdition["status"], leaderScope?: "in_app" | "in_app_and_social") {
  return {
    week: 16,
    status,
    entries: Array.from({ length: 10 }, (_, index) => ({
      rank: 10 - index,
      computedRank: 10 - index,
      score: 80.6 - index,
      reasonFr: null,
      reasonAr: null,
      movement: null,
      player: card(10 - index, 10 - index === 1 ? leaderScope : undefined),
    })),
  };
}

const COPY = {
  brand: "B",
  kicker: "K",
  title: "TOP 10",
  subtitle: "SEMAINE {n} · RISING SCORE",
  footer: "F",
  legend: "L",
  club: (player: PepitesPlayerCard) => player.team?.name.ar ?? "",
  position: () => "وسط",
};

describe("the Top 10 post", () => {
  it("lists the ten in the editor's order, with the Figma's figures", () => {
    const model = shareImageModel(edition("published"), "ar", COPY)!;
    expect(model.subtitle).toBe("SEMAINE 16 · RISING SCORE");
    expect(model.rows.map((row) => row.rank)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    // The name is isolated so it keeps its order in an Arabic picture; the
    // bar lights round(score / 10) segments.
    expect(model.rows[0]).toMatchObject({
      rank: "1",
      rankNumber: 1,
      name: "\u2068Joueur 1\u2069",
      meta: "النادي · وسط",
      score: "72",
      segments: 7,
      initials: "J",
      club: "#1a3a7a",
    });
  });

  it("has none for a withdrawn edition", () => {
    expect(shareImageModel(edition("withdrawn"), "fr", COPY)).toBeNull();
  });

  it("shows a photo only when its release allows social use", () => {
    const origin = "https://project.supabase.co";
    expect(sharePhotoUrl(card(1, "in_app_and_social"), origin)).toBe(
      `${origin}/storage/v1/object/public/football-media/football/players/p1.webp`,
    );
    expect(sharePhotoUrl(card(1, "in_app"), origin)).toBeNull();
    expect(sharePhotoUrl(card(2), origin)).toBeNull();
    expect(
      shareImageModel(edition("published", "in_app"), "fr", COPY)!.rows[0]!.photoUrl,
    ).toBeNull();
    expect(
      shareImageModel(edition("published", "in_app_and_social"), "fr", COPY)!.rows[0]!.photoUrl,
    ).toBe(sharePhotoUrl(card(1, "in_app_and_social")));
  });
});

describe("the player's story card", () => {
  const score = {
    score: 70.4,
    rank: 5,
    minutes: 1159,
    ratingAvg: 6.6,
    percentiles: { rating: 65, form: 77, contribution: 90, progression: 62, minutes: null },
  };
  const copy = {
    brand: "Pépites",
    kicker: "U23 · BOTOLA PRO",
    meta: "M",
    legend: ["a", "b", "c", "d", "e"],
    rankLine: "RISING SCORE · N°{n}",
    statsLine: "{minutes} MIN · NOTE {rating}",
    footer: "botolago.com/pepites",
  };

  it("splits the name, pads the ghost rank and keeps the percentiles in the wheel's order", () => {
    const model = storyModel({ ...card(5), name: "Mohamed El Arouch" }, score, "fr", copy);
    expect([model.firstName, model.lastName]).toEqual(["MOHAMED", "EL AROUCH"]);
    expect(model.ghost).toBe("05");
    expect(model.percentiles).toEqual([65, 77, 90, 62, null]);
    expect(model.score).toBe("70");
    expect(model.rankLine).toBe("RISING SCORE · N°5");
    expect(model.statsLine).toBe("1\u202f159 MIN · NOTE 6,60");
  });

  it("keeps Arabic names as written, and one word on the second line", () => {
    expect(splitName("Achraf")).toEqual(["", "Achraf"]);
    const model = storyModel({ ...card(5), name: "Achraf V." }, score, "ar", copy);
    expect([model.firstName, model.lastName]).toEqual(["Achraf", "V."]);
    expect(model.statsLine).toBe("1159 MIN · NOTE 6,60");
  });
});
