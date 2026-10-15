import { describe, expect, it } from "bun:test";

import type { RivalImageModel } from "./plus-rivals-image";

/**
 * The picture is drawn on a canvas in the member's browser, so its pixels are checked by looking at
 * it (the screenshots of the work). What is pinned here is what may go on it: the model has a place
 * for names, scores, the league, the stamp and the tally, and none for a rating.
 */
describe("the rivalry picture's model", () => {
  const model: RivalImageModel = {
    lang: "fr",
    leagueName: "Les Lions du Derb",
    stamp: "Journée 11 · Publié le 12 oct.",
    meName: "Karim B.",
    rivalName: "Sami Berrada",
    meInitials: "KB",
    rivalInitials: "SB",
    meScore: "62",
    rivalScore: "58",
    verdict: "Journée 11 : vous gagnez 62 à 58",
    totalLabel: "Total",
    meTotal: "612",
    rivalTotal: "598",
    gap: "Vous menez de 14 pts",
    bilan: "Bilan : 7 victoires, 4 défaites",
    leader: "me",
  };

  it("carries the friend's full name and no card rating, serial or tier", () => {
    expect(model.rivalName).toBe("Sami Berrada");
    expect(Object.keys(model).sort()).toEqual(
      [
        "bilan",
        "gap",
        "lang",
        "leader",
        "leagueName",
        "meInitials",
        "meName",
        "meScore",
        "meTotal",
        "rivalInitials",
        "rivalName",
        "rivalScore",
        "rivalTotal",
        "stamp",
        "totalLabel",
        "verdict",
      ].sort(),
    );
    expect(JSON.stringify(model)).not.toMatch(/ovr|rating|note|serial|tier/i);
  });
});
