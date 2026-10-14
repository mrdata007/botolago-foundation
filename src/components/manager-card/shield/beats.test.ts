import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BeatName } from "../types";
import { BEAT_CAP_MS, BEAT_MS, BEATS, NEVER_ANIMATED, TIMELINE } from "./beats";
import { beatRoot, fullCard } from "./full";
import { shieldRenderer } from "./index";
import { tableEm } from "./name";
import { STRINGS, forming, founder, rated } from "./test-support";

const CSS = readFileSync(join(import.meta.dir, "shield.css"), "utf8");
const MOTION = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: no-preference)"));

describe("the beats: the timing table and the stylesheet say the same thing", () => {
  it("every move is a rule inside reduced-motion's no-preference, with its keyframes, length and delay", () => {
    for (const beat of BEATS) {
      for (const move of TIMELINE[beat]) {
        const selector = move.target === "mc-sl--foil" ? `.mc-sl--foil::after` : `.${move.target}`;
        const rule = new RegExp(
          `\\.mc-shield--beat-${beat} ${selector.replace(/[.:]/g, (c) => `\\${c}`)} \\{\\s*animation: ${move.anim} ${move.ms}ms [^;]* ${move.delay}ms both;`,
        );
        expect(MOTION, `${beat}: ${move.target}`).toMatch(rule);
        expect(MOTION).toContain(`@keyframes ${move.anim} {`);
      }
    }
    // nothing outside the media query animates
    const before = CSS.slice(0, CSS.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(before).not.toMatch(/animation:/);
    expect(before).not.toMatch(/@keyframes/);
  });

  it("each beat ends within the cap and the renderer reports its length", () => {
    for (const beat of BEATS) {
      expect(BEAT_MS[beat]).toBeGreaterThan(0);
      expect(BEAT_MS[beat]).toBeLessThanOrEqual(BEAT_CAP_MS);
      expect(shieldRenderer.beatMs(beat)).toBe(BEAT_MS[beat]);
    }
    expect(shieldRenderer.beatMs("nope" as BeatName)).toBe(0);
  });

  it("never animates the number, the text layer or the serial", () => {
    for (const cls of NEVER_ANIMATED) {
      expect(MOTION).not.toMatch(new RegExp(`\\.${cls}\\s*\\{\\s*animation`));
    }
    const targets = new Set(BEATS.flatMap((beat) => TIMELINE[beat].map((m) => m.target)));
    for (const cls of NEVER_ANIMATED) expect(targets.has(cls)).toBe(false);
  });
});

describe("a beat is the root's class and attribute, and nothing else", () => {
  const cases: [BeatName, typeof rated][] = [
    ["make", rated],
    ["tick", rated],
    ["tick", forming],
    ["first", rated],
    ["tier", rated],
    ["legend", { ...rated, ovr: 93, tier: "legend" }],
    ["founder", founder],
    ["castoff", rated],
  ];
  for (const [beat, profile] of cases) {
    it(`${beat}${profile === forming ? " (forming)" : ""}: full(beat) is full() plus beatRoot`, () => {
      for (const lang of ["fr", "ar"] as const) {
        const strings = STRINGS[lang];
        const plain = fullCard(profile, { strings, theme: "light" }, tableEm);
        const played = fullCard(profile, { strings, theme: "light", beat }, tableEm);
        const root = beatRoot(profile, strings, beat);
        expect(root.classes).toEqual([`mc-shield--beat-${beat}`]);
        const withRoot = plain
          .replace(
            /^<div class="([^"]*)"/,
            (_m, cls: string) => `<div class="${cls} ${root.classes.join(" ")}"`,
          )
          .replace(/ style="/, ` data-mc-beat="${beat}" style="`);
        expect(played).toBe(withRoot);
      }
    });
  }

  it("a beat with nothing to light on this card adds nothing", () => {
    expect(beatRoot(rated, STRINGS.fr, "legend")).toEqual({ classes: [], attrs: {} });
    expect(beatRoot(rated, STRINGS.fr, "founder")).toEqual({ classes: [], attrs: {} });
    expect(beatRoot({ ...forming, counted: 0 }, STRINGS.fr, "tick")).toEqual({
      classes: [],
      attrs: {},
    });
  });
});
