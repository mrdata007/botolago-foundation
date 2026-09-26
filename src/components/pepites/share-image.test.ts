import { describe, expect, it } from "bun:test";

import type { PepitesEdition, PepitesPlayerCard } from "@/backend/pepites/contracts";

import { shareImageModel, sharePhotoUrl } from "./share-image";

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

const COPY = { kicker: "K", title: "Top 10 · Semaine {n}", subtitle: "S", footer: "F" };

describe("the share image", () => {
  it("lists the ten in the editor's order, scores rounded, clubs in the reader's language", () => {
    const model = shareImageModel(edition("published"), "ar", COPY)!;
    expect(model.title).toBe("Top 10 · Semaine 16");
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
    // The name is isolated so it keeps its order in an Arabic picture.
    expect(model.rows[0]).toEqual({
      rank: "1",
      name: "\u2068Joueur 1\u2069",
      club: "ن",
      score: "72",
    });
  });

  it("has none for a withdrawn edition", () => {
    expect(shareImageModel(edition("withdrawn"), "fr", COPY)).toBeNull();
  });

  it("shows the leader's photo only when its release allows social use", () => {
    const origin = "https://project.supabase.co";
    expect(sharePhotoUrl(card(1, "in_app_and_social"), origin)).toBe(
      `${origin}/storage/v1/object/public/football-media/football/players/p1.webp`,
    );
    expect(sharePhotoUrl(card(1, "in_app"), origin)).toBeNull();
    expect(sharePhotoUrl(card(2), origin)).toBeNull();
    expect(shareImageModel(edition("published", "in_app"), "fr", COPY)!.leaderPhotoUrl).toBeNull();
    expect(
      shareImageModel(edition("published", "in_app_and_social"), "fr", COPY)!.leaderPhotoUrl,
    ).toBe(sharePhotoUrl(card(1, "in_app_and_social")));
  });
});
