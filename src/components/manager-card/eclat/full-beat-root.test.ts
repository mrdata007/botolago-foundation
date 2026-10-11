import { describe, expect, it } from "bun:test";

import { BEAT_MS } from "./beats";
import { beatRoot } from "./full";
import { eclatRenderer } from "./index";
import { AR, FR, PROFILES } from "./test-data";
import type { BeatName } from "../types";

/**
 * `ManagerCard` plays a beat on the card that is in the page by adding what `beatRoot` says to the
 * card's root, instead of drawing the card again with the beat. That is only the same card if the
 * root is all that a beat changes: this reads the real markup, with and without each beat, on every
 * test profile in both languages.
 */
const BEATS = Object.keys(BEAT_MS) as BeatName[];
const THEME = "light" as const;

/** The root's opening tag, and everything after it with the ids made equal (each draw numbers its own). */
function parts(html: string): { open: string; rest: string } {
  const end = html.indexOf(">") + 1;
  return { open: html.slice(0, end), rest: html.slice(end).replace(/mc-\d+-/g, "mc-N-") };
}
const classesOf = (open: string): string[] => /class="([^"]*)"/.exec(open)![1]!.split(/\s+/);
const attrsOf = (open: string): Record<string, string> =>
  Object.fromEntries([...open.matchAll(/\s([\w-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));

describe("a beat played on the card that is drawn", () => {
  for (const strings of [FR, AR]) {
    for (const [name, profile] of Object.entries(PROFILES)) {
      for (const beat of BEATS) {
        const root = beatRoot(profile, strings, beat);
        if (root === null) continue;
        it(`${strings.lang} ${name} ${beat}: the root is all the beat changes`, () => {
          const still = parts(eclatRenderer.full(profile, { strings, theme: THEME }));
          const played = parts(eclatRenderer.full(profile, { strings, theme: THEME, beat }));
          expect(played.rest).toBe(still.rest);
          const classes = new Set(classesOf(still.open));
          for (const c of root.classes) classes.add(c);
          expect(new Set(classesOf(played.open))).toEqual(classes);
          expect(attrsOf(played.open)).toEqual({
            ...attrsOf(still.open),
            class: classesOf(played.open).join(" "),
            ...root.attrs,
          });
        });
      }
    }
  }

  it("is left to a new drawing for the beats that change the markup or look different on a lifted card", () => {
    const rated = PROFILES.rated;
    expect(beatRoot(rated, FR, "castoff")).toBeNull();
    expect(beatRoot(PROFILES.legend, FR, "legend")).toBeNull();
    expect(beatRoot(PROFILES.forming1, FR, "tick")).toBeNull();
    // a rated card's tick is the floodlights' pulse, which plays in place
    expect(beatRoot(rated, FR, "tick")).toEqual({
      classes: ["mc-eclat--beat-tick", "mc-eclat--pulse"],
      attrs: { "data-mc-beat": "tick" },
    });
  });

  it("has nothing to add when the beat has nothing to light on the card", () => {
    // `tier` on a card with no tier, `founder` on a card that is not a founder's
    expect(beatRoot(PROFILES.rated, FR, "founder")).toEqual({ classes: [], attrs: {} });
    expect(beatRoot(PROFILES.forming1, FR, "tier")).toEqual({ classes: [], attrs: {} });
  });

  it("is what the renderer offers", () => {
    expect(eclatRenderer.beatRoot?.(PROFILES.rated, { strings: FR }, "first")).toEqual({
      classes: ["mc-eclat--beat-first"],
      attrs: { "data-mc-beat": "first" },
    });
  });
});
