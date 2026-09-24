import { describe, expect, it } from "bun:test";

import { clubPalette } from "@/lib/club-palette";
import {
  AUTH_BAND_CLUBS,
  profileClubs,
  profileInitials,
  setupStepFromSearch,
} from "./account-model";

describe("profileInitials", () => {
  it("takes the first letter of the first two words of the display name", () => {
    expect(profileInitials("Rachid Demo")).toBe("RD");
    expect(profileInitials("mehdi  benali  alaoui")).toBe("MB");
    expect(profileInitials("Zineb")).toBe("Z");
  });

  it("uppercases Latin initials, accented ones included", () => {
    expect(profileInitials("élodie ouazzani")).toBe("ÉO");
  });

  it("skips punctuation and symbols to find a letter", () => {
    expect(profileInitials("(Mehdi) — Benali")).toBe("MB");
  });

  it("falls back to the username when there is no display name", () => {
    expect(profileInitials("", "rachid_demo")).toBe("R");
    expect(profileInitials("   ", "@botola_fan")).toBe("B");
    expect(profileInitials(undefined, "zineb")).toBe("Z");
  });

  it("draws ONE letter for an Arabic name, never two joined ones", () => {
    expect(profileInitials("محمد أمين")).toBe("م");
    expect(profileInitials("", "أمين")).toBe("أ");
  });

  it("returns nothing to draw when neither name has a letter", () => {
    expect(profileInitials("", "")).toBe("");
    expect(profileInitials(null, null)).toBe("");
    expect(profileInitials("—", "__")).toBe("");
  });
});

describe("profileClubs", () => {
  const wac = { id: "wac" };
  const rca = { id: "rca" };
  const fus = { id: "fus" };

  it("draws no section when nothing is followed", () => {
    expect(profileClubs(wac, [])).toEqual([]);
    expect(profileClubs(undefined, [])).toEqual([]);
  });

  it("draws no section when the only followed club is the favourite", () => {
    // The favourite is already the supporter chip on the identity card.
    expect(profileClubs(wac, [wac])).toEqual([]);
  });

  it("puts the favourite first, badged, and never repeats it", () => {
    expect(profileClubs(wac, [rca, wac, fus])).toEqual([
      { club: wac, favorite: true },
      { club: rca, favorite: false },
      { club: fus, favorite: false },
    ]);
  });

  it("leads with the favourite even when it is not itself followed", () => {
    expect(profileClubs(wac, [rca]).map((tile) => tile.club.id)).toEqual(["wac", "rca"]);
  });

  it("keeps the service's order when there is no favourite", () => {
    expect(profileClubs(undefined, [fus, rca])).toEqual([
      { club: fus, favorite: false },
      { club: rca, favorite: false },
    ]);
  });
});

describe("setupStepFromSearch", () => {
  it("opens the club picker or the notifications step", () => {
    expect(setupStepFromSearch(2)).toBe(2);
    expect(setupStepFromSearch(3)).toBe(3);
    expect(setupStepFromSearch("3")).toBe(3);
  });

  it("treats anything else as the wizard's own start", () => {
    for (const raw of [undefined, null, 1, "1", 0, 4, "x", 2.5, "", {}]) {
      expect(setupStepFromSearch(raw)).toBeUndefined();
    }
  });
});

describe("AUTH_BAND_CLUBS", () => {
  it("is eight clubs, each a real kit-table colour rather than the ink fallback", () => {
    expect(AUTH_BAND_CLUBS).toHaveLength(8);
    for (const club of AUTH_BAND_CLUBS) {
      const palette = clubPalette(club);
      expect({ club, source: palette.source }).toEqual({ club, source: "kit" });
    }
  });

  it("never paints the same colour twice in a row", () => {
    const fills = AUTH_BAND_CLUBS.map((club) => clubPalette(club).light.fill);
    for (let i = 1; i < fills.length; i += 1) {
      expect(fills[i]).not.toBe(fills[i - 1]);
    }
  });
});
