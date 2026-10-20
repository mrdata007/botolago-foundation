import { describe, expect, it } from "bun:test";

import { ladderProfile } from "../to-profile";
import { TIER_CODES } from "../types";
import { fullCard } from "./full";
import { cardImage } from "./image";
import { METAL, PAID_EDITIONS } from "./metal";
import { tableEm } from "./name";
import { STRINGS, forming, rated } from "./test-support";
import { tokenMarkup } from "./token";
import { contrast, makeView } from "./view";

const withColour = (primary: string) => ({
  ...forming,
  club: { ...forming.club!, primary },
});

describe("a new manager's club colours", () => {
  it("gives different clubs distinct base faces and restores graphite with no club", () => {
    const faces = ["#00843d", "#ce0037", "#f9d100"].map((primary) =>
      makeView(withColour(primary), STRINGS.fr).m.faceStops.join(","),
    );
    expect(new Set(faces).size).toBe(3);
    const neutral = makeView({ ...forming, club: null }, STRINGS.fr).m;
    expect(neutral).toBe(METAL.base);
    expect(faces).not.toContain(neutral.faceStops.join(","));
    expect(makeView(withColour('red; background:url("bad")'), STRINGS.fr).m).toBe(METAL.base);
  });

  it("paints the same club face in signup tokens, full cards and share art in both languages", () => {
    for (const lang of ["fr", "ar"] as const) {
      for (const primary of ["#00843d", "#ce0037"]) {
        const profile = withColour(primary);
        const strings = STRINGS[lang];
        const stops = makeView(profile, strings).m.faceStops;
        const full = fullCard(profile, { strings, theme: "light" }, tableEm);
        const token = tokenMarkup(profile, strings, 64, "light");
        const share = cardImage(profile, strings, tableEm).svg;
        for (const stop of stops) {
          expect(full).toContain(stop);
          expect(token).toContain(`stop-color="${stop}"`);
          expect(share).toContain(`stop-color="${stop}"`);
        }
      }
    }
  });

  it("keeps new-card text readable even for white, yellow and black clubs", () => {
    for (const primary of ["#ffffff", "#ffff00", "#000000", "#00843d", "#ce0037", "#00ffff"]) {
      const material = makeView(withColour(primary), STRINGS.fr).m;
      for (const stop of material.faceStops) {
        expect(contrast(material.ink, stop), primary).toBeGreaterThanOrEqual(4.5);
        expect(contrast(material.ink2, stop), primary).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("preserves earned tiers, ladder materials and paid finishes", () => {
    for (const tier of TIER_CODES) {
      expect(makeView({ ...rated, tier }, STRINGS.fr).m).toBe(METAL[tier]);
      expect(makeView(ladderProfile(forming, tier), STRINGS.fr).m).toBe(METAL[tier]);
    }
    for (const edition of PAID_EDITIONS) {
      expect(makeView({ ...forming, edition }, STRINGS.fr).m).toBe(
        makeView({ ...forming, club: null, edition }, STRINGS.fr).m,
      );
    }
  });
});
