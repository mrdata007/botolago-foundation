import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ANIMATED, BEAT_CAP_MS, BEAT_MS, NEVER_ANIMATED, TIMELINE } from "./beats";
import { appliedBeat } from "./full";
import { eclatRenderer } from "./index";
import { AR, FR, MOCK_CARDS, PROFILES } from "./test-data";
import { layer, tokenise } from "./test-markup";
import { makeView } from "./view";
import type { BeatName, CardProfile } from "../types";

const CSS = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");
const BEATS = Object.keys(TIMELINE) as BeatName[];

/** The CSS with its comments removed. */
const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** The text of the block that opens at `bare[open]` (the `{`), without the braces. */
function block(src: string, open: number): { body: string; end: number } {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return { body: src.slice(open + 1, i), end: i };
  }
  throw new Error("unbalanced braces");
}

/** Every `@media` block of the sheet: its condition and what is inside. */
function mediaBlocks(src: string): { cond: string; body: string }[] {
  const out: { cond: string; body: string }[] = [];
  for (const m of src.matchAll(/@media\s+([^{]+)\{/g)) {
    const { body } = block(src, m.index! + m[0].length - 1);
    out.push({ cond: m[1]!.trim(), body });
  }
  return out;
}

/** The rules of a block, flat: selector and declarations (nested blocks are read as rules too). */
function rules(src: string): { selector: string; decls: string }[] {
  return [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    decls: m[2]!.trim(),
  }));
}

const NO_PREF = mediaBlocks(bare).find(
  (b) => b.cond === "(prefers-reduced-motion: no-preference)",
)!;

interface Anim {
  beat: BeatName;
  target: string;
  name: string;
  ms: number;
  delay: number;
  selector: string;
}

const TARGETS = [
  "mc-flood",
  "mc-field",
  "mc-eclat__foil",
  "mc-foil-shift",
  "mc-mark",
  "mc-capsule",
  "mc-seal",
] as const;

const ANIMATION =
  /^([\w-]+)\s+(\d+)ms\s+(?:steps\([^)]*\)|cubic-bezier\([^)]*\)|ease(?:-out|-in|-in-out)?|linear)(?:\s+(\d+)ms)?\s+both$/;

/** Every animation a beat's rule declares, from the stylesheet. */
function beatAnimations(): Anim[] {
  const out: Anim[] = [];
  for (const r of rules(NO_PREF.body)) {
    const m = /animation:\s*([^;]+);/.exec(r.decls + ";");
    if (!m) continue;
    for (const part of r.selector.split(",").map((s) => s.trim())) {
      const beat = /\.mc-eclat--beat-(\w+)/.exec(part)?.[1] as BeatName | undefined;
      if (!beat) continue;
      const last = part.split(/\s+/).slice(1).join(" ");
      const target = TARGETS.find((t) => last.includes(t));
      const a = ANIMATION.exec(m[1]!.trim());
      if (!a) throw new Error(`cannot read the animation of ${part}: ${m[1]}`);
      if (!target) throw new Error(`no known target in ${part}`);
      out.push({
        beat,
        target,
        name: a[1]!,
        ms: Number(a[2]),
        delay: Number(a[3] ?? 0),
        selector: part,
      });
    }
  }
  return out;
}

describe("the beats' timing table and the stylesheet agree (plan 9)", () => {
  const all = beatAnimations();

  it("has the seven beats of the plan with their lengths, none past the 600 ms cap", () => {
    expect(BEATS.sort()).toEqual(
      ["castoff", "first", "founder", "legend", "make", "tick", "tier"].sort(),
    );
    expect(BEAT_MS).toEqual({
      make: 600,
      tick: 300,
      first: 560,
      tier: 600,
      legend: 540,
      founder: 520,
      castoff: 420,
    });
    for (const b of BEATS) expect(BEAT_MS[b], b).toBeLessThanOrEqual(BEAT_CAP_MS);
    expect(BEAT_CAP_MS).toBe(600);
    for (const b of BEATS) expect(eclatRenderer.beatMs(b)).toBe(BEAT_MS[b]);
  });

  it("declares in CSS every move of the table and nothing else, with the same start and length", () => {
    for (const beat of BEATS) {
      const css = all.filter((a) => a.beat === beat);
      expect(css.length, beat).toBeGreaterThan(0);
      for (const a of css) {
        const move = TIMELINE[beat].find(
          (m) =>
            m.target === a.target &&
            m.anim.includes(a.name) &&
            m.delay === a.delay &&
            m.ms === a.ms,
        );
        expect(move, `${beat}: ${a.selector} ${a.name} ${a.delay}+${a.ms}`).toBeDefined();
      }
      for (const m of TIMELINE[beat]) {
        const found = css.filter(
          (a) =>
            a.target === m.target &&
            m.anim.includes(a.name) &&
            a.delay === m.delay &&
            a.ms === m.ms,
        );
        expect(found.length, `${beat}: ${m.target} ${m.anim.join("/")}`).toBeGreaterThan(0);
      }
      // the beat's length is the latest end of what the stylesheet runs
      expect(Math.max(...css.map((a) => a.delay + a.ms)), beat).toBe(BEAT_MS[beat]);
    }
  });

  it("moves only the floodlights, the field, the foil overlay, the foil shift, the marks, the capsule and the seal", () => {
    for (const a of all) expect(TARGETS as readonly string[]).toContain(a.target);
    for (const beat of BEATS) {
      for (const cls of ANIMATED[beat]) expect(TARGETS as readonly string[]).toContain(cls);
    }
    const selectors = rules(NO_PREF.body)
      .filter((r) => /animation:/.test(r.decls))
      .map((r) => r.selector)
      .join("\n");
    for (const never of [
      ...NEVER_ANIMATED,
      "data-mc",
      "text",
      "tspan",
      "mc-f-",
      "mc-shirt",
      "mc-l--",
      "mc-num",
      "serial",
    ]) {
      // `mc-shirt-cast` follows the light but is never in a beat; a beat never names the shirt
      expect(selectors.includes(never), `a beat's selector names ${never}`).toBe(false);
    }
  });

  it("keeps every keyframe and every animation inside prefers-reduced-motion: no-preference", () => {
    // the sheet's only @keyframes and `animation:` declarations are in a no-preference block
    const outside = bare.replace(NO_PREF.body, "");
    const inOtherMedia = mediaBlocks(outside).filter((b) => /animation:|@keyframes/.test(b.body));
    // the touch float lives in its own `no-preference and (hover: none)` block
    for (const b of inOtherMedia) {
      expect(b.cond).toBe("(prefers-reduced-motion: no-preference) and (hover: none)");
    }
    // nothing else is outside: remove the media blocks and look for stray animation or keyframes
    let rest = outside;
    for (const b of mediaBlocks(outside)) rest = rest.replace(b.body, "");
    expect(/@keyframes|animation\s*:/.test(rest)).toBe(false);
  });

  it("moves each beat's parts through opacity, clip-path, transform, stroke and background position only", () => {
    const ALLOWED = new Set([
      "opacity",
      "clip-path",
      "transform",
      "stroke-dashoffset",
      "fill-opacity",
      "background-position",
    ]);
    const frames = [...NO_PREF.body.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)];
    expect(frames.length).toBeGreaterThanOrEqual(12);
    const names = new Set<string>();
    for (const f of frames) {
      names.add(f[1]!);
      const { body } = block(NO_PREF.body, f.index! + f[0].length - 1);
      for (const r of rules(body)) {
        for (const d of r.decls.split(";").filter(Boolean)) {
          const prop = d.split(":")[0]!.trim();
          expect(ALLOWED.has(prop), `${f[1]}: ${prop}`).toBe(true);
        }
      }
    }
    // every keyframe a beat names exists, and none is left unused
    const used = new Set(beatAnimations().map((a) => a.name));
    for (const n of used) expect(names.has(n), n).toBe(true);
    for (const n of names) expect(used.has(n), `${n} is not used by any beat`).toBe(true);
  });

  it("ends each beat in the state the card rests in, so dropping the class never jumps", () => {
    // `both` holds the last keyframe; the rest state must be what that keyframe holds. Where a
    // keyframes block has no `to`, the element's own rest value is the end: the sweep's band is the
    // exception, and it ends off the card.
    const sweep = /@keyframes mc-sweep\s*\{([\s\S]*?)\n {2}\}/.exec(NO_PREF.body)![1]!;
    expect(sweep).toMatch(/from\s*\{\s*transform:\s*translateX\(calc\(var\(--mc-dx\) \* -115%\)\)/);
    expect(sweep).toMatch(/to\s*\{\s*transform:\s*translateX\(calc\(var\(--mc-dx\) \* 115%\)\)/);
    // the diffraction and the prism both start away from rest and end at it (no `to`)
    for (const name of ["mc-diffract", "mc-prism", "mc-prism-shift"]) {
      const m = new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n {2}\\}`).exec(NO_PREF.body)!;
      expect(m[1]!.includes("to {"), name).toBe(false);
    }
    // the reveal is the same keyframe in both languages (the field is inside the mirrored group)
    expect(CSS.includes("mc-reveal-rtl")).toBe(false);
    // no selector asks the browser to look inside the card (:has) to choose a beat
    expect(NO_PREF.body.includes(":has(")).toBe(false);
  });
});

describe("a beat has something to light and never touches the number, the serial or a text", () => {
  const cards: [string, CardProfile][] = [
    ["rated", PROFILES.rated],
    ["champion", PROFILES.champion],
    ["legend", PROFILES.legend],
    ["founder", PROFILES.founder],
    ["forming", { ...PROFILES.forming1, counted: 2 }],
    ["base", PROFILES.born0],
    ...MOCK_CARDS.map((c, i) => [`mock ${i}`, c.profile] as [string, CardProfile]),
  ];
  const draw = (p: CardProfile, beat: BeatName, lang: "fr" | "ar" = "fr") =>
    eclatRenderer.full(p, { strings: lang === "ar" ? AR : FR, theme: "light", beat });
  const rootClass = (html: string) => tokenise(html)[0]!.attrs.class ?? "";

  it("puts the beat on the root, and only when the card has something to move", () => {
    for (const [name, p] of cards) {
      for (const beat of BEATS) {
        const applied = appliedBeat(makeView(p, FR), beat);
        const cls = rootClass(draw(p, beat));
        expect(cls.includes(`mc-eclat--beat-${beat}`), `${name} ${beat}`).toBe(applied === beat);
        if (applied !== beat)
          expect(cls.includes("mc-eclat--beat-"), `${name} ${beat}`).toBe(false);
      }
    }
  });

  it("holds, for each applied beat, an element of every class the beat moves", () => {
    for (const [name, p] of cards) {
      for (const beat of BEATS) {
        if (appliedBeat(makeView(p, FR), beat) !== beat) continue;
        const html = draw(p, beat);
        const has = (cls: string) =>
          cls === "mc-eclat__foil"
            ? html.includes('class="mc-eclat__foil"')
            : html.includes(`class="${cls}`) ||
              html.includes(` ${cls} `) ||
              html.includes(` ${cls}"`);
        for (const m of TIMELINE[beat]) {
          // a tick lights a mark on a forming card and pulses the floodlights on a rated one
          if (beat === "tick" && m.target === "mc-mark" && p.ovr != null) continue;
          if (beat === "tick" && m.target === "mc-flood" && p.ovr == null) continue;
          // the diffraction is the foil overlay's pseudo-element; a flat card has no foil shift
          expect(has(m.target), `${name} ${beat} ${m.target}`).toBe(true);
        }
      }
    }
  });

  it("tells a rated card's tick (the floodlights pulse) from a forming card's (its newest mark)", () => {
    expect(rootClass(draw(PROFILES.rated, "tick"))).toContain("mc-eclat--pulse");
    expect(rootClass(draw({ ...PROFILES.forming1, counted: 2 }, "tick"))).not.toContain(
      "mc-eclat--pulse",
    );
    for (const beat of BEATS.filter((b) => b !== "tick")) {
      expect(rootClass(draw(PROFILES.rated, beat))).not.toContain("mc-eclat--pulse");
    }
    expect(rootClass(draw(PROFILES.rated))).not.toContain("mc-eclat--pulse");
  });

  /** The inner markup of every element whose class list holds one of `classes`, from one tokenising. */
  function innerOf(html: string, classes: ReadonlySet<string>): { cls: string; inner: string }[] {
    const tags = tokenise(html);
    const out: { cls: string; inner: string }[] = [];
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i]!;
      if (t.closing || t.selfClosing) continue;
      const cls = (t.attrs.class ?? "").split(/\s+/).find((c) => classes.has(c));
      if (!cls) continue;
      let depth = 1;
      for (let j = i + 1; j < tags.length; j++) {
        if (tags[j]!.closing) depth--;
        else if (!tags[j]!.selfClosing) depth++;
        if (depth === 0) {
          out.push({ cls, inner: html.slice(t.end, tags[j]!.start) });
          break;
        }
      }
    }
    return out;
  }

  it("never lets an animated element hold the number, the serial, a text or the shirt, in either language", () => {
    const animated = new Set(Object.values(ANIMATED).flat());
    for (const lang of ["fr", "ar"] as const) {
      for (const [name, p] of cards) {
        for (const beat of BEATS) {
          if (appliedBeat(makeView(p, FR), beat) !== beat) continue;
          const html = draw(p, beat, lang);
          const label = `${lang} ${name} ${beat}`;
          for (const { cls, inner } of innerOf(html, animated)) {
            expect(inner.includes("<text"), `${label} ${cls}`).toBe(false);
            expect(inner.includes("data-mc"), `${label} ${cls}`).toBe(false);
            expect(inner.includes("data-meta"), `${label} ${cls}`).toBe(false);
          }
          // the number's layer and the shirt's layer carry no animated class
          for (const l of ["num", "shirt"]) {
            const inner = layer(html, l)!;
            for (const cls of animated) {
              if (cls === "mc-eclat__foil") continue;
              expect(inner.includes(`class="${cls}`), `${label} ${l} ${cls}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it("has a seal line only while the castoff plays, and a mark to light only on a forming card", () => {
    for (const beat of BEATS) {
      expect(draw(PROFILES.rated, beat).includes("mc-seal")).toBe(beat === "castoff");
    }
    expect(draw({ ...PROFILES.forming1, counted: 2 }, "tick").match(/mc-mark--new/g)).toHaveLength(
      1,
    );
    expect(draw(PROFILES.rated, "tick").includes("mc-mark--new")).toBe(false);
  });
});

describe("the floating card on a touch screen and the tilt's own motion (plan 8.3)", () => {
  const tiltSource = readFileSync(join(import.meta.dir, "tilt.ts"), "utf8");

  it("floats only on a touch-only screen and only without reduced motion: a compositor animation the tilt starts", () => {
    // the float is not CSS any more: an animation of the light's custom properties repainted the
    // whole card on every frame; the tilt animates transforms on the compositor instead
    expect(bare).not.toContain("@keyframes mc-float");
    expect(bare).not.toMatch(/\.mc-eclat--idle[^{}]*\{[^{}]*animation:/);
    expect(tiltSource).toContain('window.matchMedia?.("(hover: none)")');
    expect(tiltSource).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)")');
    // reduced motion returns before anything is mounted
    expect(tiltSource.indexOf("prefers-reduced-motion: reduce")).toBeLessThan(
      tiltSource.indexOf('root.addEventListener("pointermove"'),
    );
    // it moves transforms only: the keyframes it builds carry a transform, its easing and its offset
    const keyframes = /part\.animate\(\s*\[([\s\S]*?)\],/.exec(tiltSource)![1]!;
    for (const prop of keyframes.matchAll(/(\w+):/g)) {
      expect(["transform", "easing", "offset"]).toContain(prop[1]!);
    }
    // a card that plays a beat does not float over it: that is a behaviour, tested where it runs
    // (`tilt.test.ts`, "does not float over a beat": a root that carries `data-mc-beat`)
  });

  it("eases nothing at rest or under reduced motion: every transition is scoped to a state of the tilt", () => {
    const transitions = rules(bare).filter((r) => /(^|;)\s*transition\s*:/.test(r.decls));
    expect(transitions.length).toBeGreaterThan(0);
    for (const r of transitions) {
      expect(r.selector.replace(/\s+/g, " "), r.selector).toMatch(
        /\.mc-eclat--(active|idle|settle)/,
      );
    }
    // no transition on the card itself or its root: nothing eases until the tilt asks
    expect(bare).not.toMatch(/\.mc-eclat\s*\{[^}]*transition/);
    expect(
      mediaBlocks(bare).find((b) => b.cond === "(prefers-reduced-motion: reduce)"),
    ).toBeUndefined();
  });
});
