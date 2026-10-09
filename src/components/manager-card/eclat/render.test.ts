import { describe, expect, it } from "bun:test";

import { FIXTURE_IDS, FIXTURES } from "@/backend/manager-card/fixtures";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

import { cardStrings, type Translate } from "../copy";
import { findUnsafeMarkup, HOSTILE_NAMES } from "../markup-safety";
import { fromMyCard, guestProfile } from "../to-profile";
import { BEAT_CAP_MS, BEAT_MS, ANIMATED } from "./beats";
import { eclatRenderer } from "./index";
import { ASPECT, estimateAspect } from "./estimate";
import { appliedBeat } from "./full";
import { tierWord, TIER_KEYS } from "./foil";
import { AR, FR, MOCK_ARABIC, MOCK_CARDS, MOCK_NAMES, PROFILES } from "./test-data";
import { elementsByClass, layer, texts, textsWith, trackingOf } from "./test-markup";
import { makeView, serialLine } from "./view";
import type { BeatName, CardProfile } from "../types";

const tFor =
  (lang: "fr" | "ar"): Translate =>
  (key: TranslationKey) =>
    (dictionaries[lang] as Record<string, string>)[key] ?? key;
const APP = { fr: cardStrings(tFor("fr"), "fr"), ar: cardStrings(tFor("ar"), "ar") };
const draw = (
  p: CardProfile,
  lang: "fr" | "ar" = "fr",
  theme: "light" | "dark" = "light",
  beat?: BeatName,
) => eclatRenderer.full(p, { strings: lang === "ar" ? AR : FR, theme, beat });
const ALL: [string, CardProfile][] = [
  ...FIXTURE_IDS.flatMap((id) => {
    const card = FIXTURES[id].card;
    return card ? [[id, fromMyCard(card, { sample: true })] as [string, CardProfile]] : [];
  }),
  ["guest", guestProfile()],
];
const BEATS = ["make", "tick", "first", "tier", "legend", "founder", "castoff"] as const;

describe("every fixture, language and theme (plan 12.4)", () => {
  it("draws one root with the number's group, a dash for a missing rating and never a 0", () => {
    for (const [id, p] of ALL) {
      for (const lang of ["fr", "ar"] as const) {
        for (const theme of ["light", "dark"] as const) {
          const html = eclatRenderer.full(p, { strings: APP[lang], theme });
          const where = `${id} ${lang} ${theme}`;
          expect(html.match(/role="img"/g), where).toHaveLength(1);
          expect(html.match(/data-mc="ovr"/g), where).toHaveLength(1);
          expect(html.includes('dir="' + (lang === "ar" ? "rtl" : "ltr") + '"'), where).toBe(true);
          expect(/>\s*0\s*</.test(html), where).toBe(false);
          expect(findUnsafeMarkup(html), where).toEqual([]);
          const group = /<g data-mc="ovr">(.*?)<\/g>/s.exec(layer(html, "num")!)![1]!;
          const printed = texts(group).map((t) => t.text);
          const want = p.ovr == null ? "—" : String(p.ovr);
          expect(new Set(printed), where).toEqual(new Set([want]));
        }
      }
    }
  });

  it("carries the serial, with a dash when there is none, in the frame", () => {
    for (const [id, p] of ALL) {
      const html = draw(p);
      const [serial] = textsWith(html, "meta").filter((t) => t.attrs["data-meta"] === "serial");
      expect(serial?.text, id).toBe(serialLine(FR, p.serial));
    }
    expect(serialLine(FR, null)).toBe("BOT —");
  });

  it("has the founder's capsule and mark for a founder and neither for anyone else", () => {
    const founder = draw(PROFILES.founder);
    expect(founder.includes('class="mc-capsule"')).toBe(true);
    expect(textsWith(founder, "meta").some((t) => t.attrs["data-meta"] === "founder-year")).toBe(
      true,
    );
    expect(founder.includes('data-meta="founder"')).toBe(true);
    for (const p of [PROFILES.rated, PROFILES.homa, PROFILES.guest]) {
      const html = draw(p);
      expect(html.includes("mc-capsule")).toBe(false);
      expect(html.includes('data-meta="founder"')).toBe(false);
    }
    // the year is its last two digits
    expect(
      textsWith(founder, "meta").find((t) => t.attrs["data-meta"] === "founder-year")!.text,
    ).toBe("26");
  });

  it("prints the tier word in its plaque: one per tier, none for the base card, LASTREET left to right", () => {
    for (const lang of ["fr", "ar"] as const) {
      const strings = lang === "ar" ? AR : FR;
      for (const tier of ["homa", "stade", "pro", "champion", "legend"] as const) {
        const html = draw({ ...PROFILES.rated, tier, ovr: 77 }, lang);
        const words = textsWith(html, "tier");
        expect(words, `${tier} ${lang}`).toHaveLength(1);
        expect(words[0]!.text).toBe(tierWord(tier, strings));
        const latin = !/\p{Script=Arabic}/u.test(words[0]!.text);
        expect(words[0]!.attrs.direction).toBe(latin ? "ltr" : "rtl");
        if (tier === "homa") {
          expect(words[0]!.text).toBe("LASTREET");
          expect(words[0]!.attrs.direction).toBe("ltr");
          expect(trackingOf(words[0]!)).toBe("0.22em");
        }
        if (!latin) expect(trackingOf(words[0]!)).toBeUndefined();
      }
      for (const p of [PROFILES.born0, PROFILES.forming1, PROFILES.insufficient3, PROFILES.guest]) {
        expect(textsWith(draw(p, lang), "tier")).toHaveLength(0);
      }
    }
  });

  it("sets the tracking as an inline style, never as an attribute the page's RTL reset can strip", () => {
    // `html[dir="rtl"] * { letter-spacing: normal }` (src/styles.css) outranks a presentation
    // attribute and not an inline style: the Latin runs of an Arabic card keep the tracking the
    // plaque was sized for
    for (const lang of ["fr", "ar"] as const) {
      const html = draw({ ...PROFILES.rated, tier: "homa", ovr: 41, serial: "482913" }, lang);
      expect(html.includes(" letter-spacing="), lang).toBe(false);
      const all = texts(html);
      const word = all.find((t) => "data-tier" in t.attrs)!;
      expect(trackingOf(word), `${lang} tier word`).toBe("0.22em");
      expect(word.attrs.style, lang).toBe("letter-spacing:0.22em");
      const label = all.find((t) => "data-ovrlabel" in t.attrs)!;
      expect(trackingOf(label), `${lang} OVR`).toBe("0.2em");
      const serial = all.find((t) => "data-meta" in t.attrs && t.attrs["data-meta"] === "serial");
      expect(serial && trackingOf(serial), `${lang} serial`).toBe("0.04em");
      const mark = all.find((t) => t.text === "BOTOLAGO");
      expect(mark && trackingOf(mark), `${lang} wordmark`).toBe("0.14em");
      // Arabic-script runs are never tracked: tracking breaks the joins
      for (const t of all) {
        if (/\p{Script=Arabic}/u.test(t.text))
          expect(trackingOf(t), `${lang} ${t.text}`).toBeUndefined();
      }
    }
  });

  it("draws the same card in a tier's own colours: a class and a ladder step per tier", () => {
    for (const key of TIER_KEYS) {
      const p =
        key === "base"
          ? MOCK_CARDS[0]!.profile
          : MOCK_CARDS.find((c) => c.profile.tier === key)!.profile;
      const html = draw(p);
      expect(html.includes(`mc-eclat--${key} `), key).toBe(true);
      expect(html.includes(`data-mc-tier="${key}"`), key).toBe(true);
      expect(/class="mc-eclat [^"]*\bmc-holo\b/.test(html), key).toBe(
        key === "champion" || key === "legend",
      );
    }
  });

  it("mirrors the card in Arabic: the tab and its season on the trailing side, the shapes in a mirrored group", () => {
    const ar = draw(MOCK_ARABIC[0]!.profile, "ar");
    const season = textsWith(ar, "meta").find((t) => t.attrs["data-meta"] === "season")!;
    expect(Number(season.attrs.x)).toBe(897);
    expect(
      Number(
        textsWith(draw(MOCK_CARDS[3]!.profile), "meta").find(
          (t) => t.attrs["data-meta"] === "season",
        )!.attrs.x,
      ),
    ).toBe(103);
    expect(ar.includes('<g transform="matrix(-1 0 0 1 1000 0)">')).toBe(true);
    expect(draw(MOCK_CARDS[3]!.profile).includes("matrix(-1 0 0 1 1000 0)")).toBe(false);
    // CAP is the rightmost stat: its value sits at 1000 − 252
    const values = textsWith(ar, "stat");
    expect(values.map((t) => Number(t.attrs.x))).toEqual([748, 583, 417, 252]);
    // text is never mirrored by a transform
    for (const t of texts(ar)) expect(t.attrs.transform ?? "").not.toContain("matrix(-1");
  });

  it("keeps the four stats in order with a dash for a missing one", () => {
    const html = draw(MOCK_CARDS[4]!.profile); // trf: null
    expect(textsWith(html, "stat").map((t) => t.text)).toEqual(["90", "87", "—", "88"]);
    expect(textsWith(html, "label").map((t) => t.text)).toEqual(["CAP", "SEL", "TRF", "CON"]);
  });

  it("sets the Arabic stat labels in their own face, fitted to their cell", () => {
    const labels = textsWith(draw(MOCK_ARABIC[0]!.profile, "ar"), "label");
    expect(labels.map((t) => t.text)).toEqual(
      AR.stats ? [AR.stats.cap, AR.stats.sel, AR.stats.trf, AR.stats.con] : [],
    );
    for (const t of labels) {
      expect(t.attrs.class).toBe("mc-f-a");
      expect(t.size).toBeGreaterThanOrEqual(26);
      expect(t.size).toBeLessThanOrEqual(34);
    }
  });

  it("draws the plain forming card with its marks, a dash and the name where a rated card's is", () => {
    const forming = draw(PROFILES.forming1);
    const frame = layer(forming, "frame")!;
    expect((frame.match(/data-pip="on"/g) ?? []).length).toBe(1);
    expect((frame.match(/data-pip="off"/g) ?? []).length).toBe(2);
    expect(layer(forming, "num")!.includes("data-pip")).toBe(false);
    expect(textsWith(forming, "tier")).toHaveLength(0);
    // marks are in the plaque: the plaque's path is drawn
    expect(frame.includes("M379")).toBe(false);
    const rated = draw({ ...PROFILES.rated, name: "KARIM" });
    const name = (h: string) => Number(textsWith(h, "name")[0]!.attrs.y);
    expect(name(draw({ ...PROFILES.forming1, name: "KARIM" }))).toBe(name(rated));
    // with no marks (3 of 3, no number) there is no plaque: the name is centred by its ink
    const none = draw({ ...PROFILES.insufficient3, name: "KARIM" });
    expect(layer(none, "frame")!.includes("data-pip")).toBe(false);
    expect(name(none)).not.toBe(name(rated));
  });

  it("fills the marks from the reading side in Arabic", () => {
    const ar = draw({ ...PROFILES.forming1, counted: 2 }, "ar");
    const frame = layer(ar, "frame")!;
    const pips = [...frame.matchAll(/data-pip="(on|off)"/g)].map((m) => m[1]);
    // the rects are drawn left to right: the empty one is the leftmost, the two filled on its right
    expect(pips).toEqual(["off", "on", "on"]);
    const lr = layer(draw({ ...PROFILES.forming1, counted: 2 }), "frame")!;
    expect([...lr.matchAll(/data-pip="(on|off)"/g)].map((m) => m[1])).toEqual(["on", "on", "off"]);
  });
});

describe("what a card says and how big it is", () => {
  it("has the label as its aria-label, the sample pill and the season as plain text", () => {
    const html = draw(MOCK_CARDS[3]!.profile);
    expect(html.includes(`aria-label="${eclatRenderer.label(MOCK_CARDS[3]!.profile, FR)}"`)).toBe(
      true,
    );
    const sample = textsWith(html, "meta").find((t) => t.attrs["data-meta"] === "sample")!;
    expect(sample.text).toBe("EXEMPLE");
    expect(
      textsWith(draw(MOCK_ARABIC[0]!.profile, "ar"), "meta").some(
        (t) => t.attrs["data-meta"] === "sample",
      ),
    ).toBe(false);
    const arSample = textsWith(draw({ ...MOCK_CARDS[3]!.profile }, "ar"), "meta").find(
      (t) => t.attrs["data-meta"] === "sample",
    )!;
    expect(arSample.text).toBe("مثال");
  });

  it("is always 1 : 1.618, and the estimate is exact", () => {
    expect(ASPECT).toBe(1.618);
    expect(estimateAspect()).toBe(1.618);
    for (const [, p] of ALL) {
      expect(eclatRenderer.aspect(p, FR)).toBe(1.618);
      expect(eclatRenderer.aspect(p, AR)).toBe(1.618);
    }
    expect(eclatRenderer.tokenBox(PROFILES.rated, 64)).toEqual({ width: 40, height: 64 });
    expect(eclatRenderer.tokenBox(PROFILES.rated, 80)).toEqual({ width: 49, height: 80 });
  });

  it("keeps a stage card's markup within the 46 kB budget", () => {
    for (const c of [...MOCK_CARDS, ...MOCK_ARABIC, ...MOCK_NAMES]) {
      const html = eclatRenderer.full(c.profile, {
        strings: c.lang === "ar" ? AR : FR,
        theme: "dark",
      });
      expect(html.length, c.caption).toBeLessThan(46_000);
    }
  });

  it("escapes every hostile name and the club's initials", () => {
    for (const name of HOSTILE_NAMES) {
      const p: CardProfile = { ...PROFILES.rated, name, founder: 2026 };
      for (const lang of ["fr", "ar"] as const) {
        const html = draw(p, lang);
        expect(findUnsafeMarkup(html)).toEqual([]);
        expect(html.includes("<img")).toBe(false);
        expect(html.includes("<script")).toBe(false);
      }
    }
    const p = { ...PROFILES.rated, club: { ...PROFILES.rated.club!, initials: "<b>" } };
    expect(findUnsafeMarkup(draw(p))).toEqual([]);
  });

  it("reads a hostile club colour as no club: nothing of it reaches an attribute (full, tokens, detail, image)", () => {
    const hostile: CardProfile = {
      ...PROFILES.rated,
      founder: 2026,
      club: {
        ...PROFILES.rated.club!,
        primary: '#000"/><img src=x onerror=alert(1)>',
        secondary: '"><svg onload=alert(2)>',
      },
    };
    const wrongSecondary: CardProfile = {
      ...PROFILES.rated,
      club: { ...PROFILES.rated.club!, secondary: 'red;}</style><script>"' },
    };
    for (const p of [hostile, wrongSecondary]) {
      for (const lang of ["fr", "ar"] as const) {
        const strings = lang === "ar" ? AR : FR;
        const outputs = [
          draw(p, lang),
          draw(p, lang, "dark"),
          ...([32, 44, 48, 64, 80, 120] as const).map((size) =>
            // 48 and 120 are not ladder sizes; the renderer still has to hold them safe
            eclatRenderer.token(p, { strings, theme: "light", size: size as never }),
          ),
          eclatRenderer.detail(p, "founder", { strings, theme: "light" }) ?? "",
          eclatRenderer.image(p, strings).svg,
        ];
        for (const html of outputs) {
          expect(findUnsafeMarkup(html), `${lang}`).toEqual([]);
          expect(html.includes("onerror")).toBe(false);
          expect(html.includes("onload")).toBe(false);
          expect(html.includes("<script")).toBe(false);
        }
      }
    }
    // a primary that is not a colour is no club at all: the neutral shirt and disc
    expect(makeView(hostile, FR).p.club).toBeNull();
    // a secondary that is not a colour is none; the primary stays
    const v = makeView(wrongSecondary, FR).p.club!;
    expect(v.primary).toBe(PROFILES.rated.club!.primary);
    expect(v.secondary).toBeNull();
  });
});

describe("beats (plan 9)", () => {
  const profiles: Record<string, CardProfile> = {
    rated: PROFILES.rated,
    forming: PROFILES.forming1,
    legend: PROFILES.legend,
    founder: PROFILES.founder,
    base: PROFILES.born0,
  };

  it("lists the seven beats with the lengths of the plan, none past 600 ms", () => {
    expect(eclatRenderer.beats).toEqual([...BEATS]);
    expect(BEAT_MS).toEqual({
      make: 600,
      tick: 300,
      first: 560,
      tier: 600,
      legend: 540,
      founder: 520,
      castoff: 420,
    });
    for (const beat of BEATS) {
      expect(eclatRenderer.beatMs(beat)).toBe(BEAT_MS[beat]);
      expect(BEAT_MS[beat]).toBeLessThanOrEqual(BEAT_CAP_MS);
    }
    expect(eclatRenderer.beatMs("nope" as BeatName)).toBe(0);
  });

  it("drops a beat that has nothing to light on this card", () => {
    const v = (p: CardProfile) => makeView(p, FR);
    expect(appliedBeat(v(profiles.base!), "tier")).toBe("");
    expect(appliedBeat(v(profiles.rated!), "founder")).toBe("");
    expect(appliedBeat(v(profiles.founder!), "founder")).toBe("founder");
    expect(appliedBeat(v(profiles.rated!), "legend")).toBe("");
    expect(appliedBeat(v(profiles.legend!), "legend")).toBe("legend");
    expect(appliedBeat(v(profiles.legend!), "tier")).toBe("");
    expect(appliedBeat(v(profiles.rated!), "tier")).toBe("tier");
    expect(appliedBeat(v(PROFILES.born0), "tick")).toBe("");
    expect(appliedBeat(v(PROFILES.forming1), "tick")).toBe("tick");
    expect(appliedBeat(v(profiles.rated!), "tick")).toBe("tick");
    expect(appliedBeat(v(profiles.rated!), "castoff")).toBe("castoff");
    expect(appliedBeat(v(profiles.rated!), undefined)).toBe("");
  });

  it("marks the root with the beat that plays and with nothing else", () => {
    expect(draw(profiles.rated!, "fr", "light", "make")).toContain("mc-eclat--beat-make");
    expect(draw(profiles.rated!, "fr", "light", "founder")).not.toContain("mc-eclat--beat-");
    expect(draw(profiles.rated!)).not.toContain("mc-eclat--beat-");
  });

  it("never animates the number, the serial, a text or the shirt: the animated parts hold none", () => {
    const classes = new Set(Object.values(ANIMATED).flat());
    for (const p of [...MOCK_CARDS.map((c) => c.profile), PROFILES.forming1, PROFILES.founder]) {
      for (const beat of BEATS) {
        const html = draw(p, "fr", "light", beat);
        for (const cls of classes) {
          for (const name of ["g", "rect", "path", "div", "ellipse"]) {
            for (const inner of elementsByClass(html, name, cls)) {
              expect(inner.includes("<text"), `${cls} holds text`).toBe(false);
              expect(inner.includes("data-mc"), `${cls} holds the number`).toBe(false);
            }
          }
        }
        // the number's layer and the shirt's carry no animated class at all
        for (const name of ["num", "shirt"]) {
          const inner = layer(html, name)!;
          for (const cls of classes) {
            if (cls === "mc-eclat__foil") continue;
            expect(inner.includes(`class="${cls}`), `${name} has ${cls}`).toBe(false);
          }
        }
      }
    }
  });

  it("draws the castoff beat's seal line round the shield only while it plays", () => {
    const seal = draw(PROFILES.rated, "fr", "light", "castoff");
    expect(layer(seal, "frame")!.includes('class="mc-seal"')).toBe(true);
    expect(layer(seal, "frame")!.includes('pathLength="1000"')).toBe(true);
    expect(draw(PROFILES.rated).includes("mc-seal")).toBe(false);
  });

  it("marks the newest filled mark for the tick beat", () => {
    const frame = layer(
      draw({ ...PROFILES.forming1, counted: 2 }, "fr", "light", "tick"),
      "frame",
    )!;
    expect((frame.match(/mc-mark--new/g) ?? []).length).toBe(1);
    expect(frame.indexOf("mc-mark--new")).toBeGreaterThan(frame.indexOf('class="mc-mark"'));
  });
});

describe("the detail and the share art (plan 7)", () => {
  it("crops the founder's corner of the flat card, mirrored in Arabic, for a founder only", () => {
    const fr = eclatRenderer.detail(PROFILES.founder, "founder", { strings: FR, theme: "light" })!;
    expect(fr).toContain('viewBox="560 1100 440 518"');
    expect(fr.match(/role="img"/g)).toHaveLength(1);
    expect(fr).toContain(`aria-label="${FR.founderLine}"`);
    expect(fr.includes("mc-capsule")).toBe(true);
    const ar = eclatRenderer.detail(PROFILES.founder, "founder", { strings: AR, theme: "light" })!;
    expect(ar).toContain('viewBox="0 1100 440 518"');
    expect(
      eclatRenderer.detail(PROFILES.rated, "founder", { strings: FR, theme: "light" }),
    ).toBeNull();
    expect(findUnsafeMarkup(fr)).toEqual([]);
  });

  it("hands the share picture a text-free SVG at its rest pose and every text as a run", () => {
    for (const lang of ["fr", "ar"] as const) {
      const art = eclatRenderer.image(MOCK_CARDS[5]!.profile, lang === "ar" ? AR : FR);
      expect(art.svg.includes("<text")).toBe(false);
      expect(art.svg.includes("<tspan")).toBe(false);
      expect(art.width).toBe(707);
      expect(art.height).toBe(1144);
      expect(art.height / art.width).toBeCloseTo(1.618, 2);
      const spoken = art.texts.map((r) => r.text);
      const tier = tierWord("legend", lang === "ar" ? AR : FR);
      for (const expected of [
        "99",
        "OVR",
        "26",
        "BOT #5508",
        "2026/27",
        tier,
        "YASMINE",
        "ALAOUI",
        "FAR",
      ]) {
        expect(spoken, `${lang} ${expected}`).toContain(expected);
      }
      // no stylesheet in an SVG drawn as an image: the moving parts carry their rest transforms
      expect(art.svg).toContain('transform="translate(12 -19.2)"');
      expect(art.svg).toContain('transform="translate(38.4 -64)"');
      // the serif and the light faces are asked for by name; the wordmark on the rail is not drawn
      expect(art.texts.some((r) => r.face === "serif")).toBe(true);
      expect(art.texts.some((r) => r.text === "BOTOLAGO")).toBe(false);
      for (const r of art.texts) {
        expect(r.size).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThan(0);
        expect(r.x).toBeLessThan(707);
        expect(r.y).toBeGreaterThan(0);
        expect(r.y).toBeLessThan(1144);
      }
      const founder = art.texts.find((r) => r.text === "26")!;
      expect(Math.abs(founder.rotate!)).toBe(45);
      expect(findUnsafeMarkup(art.svg)).toEqual([]);
    }
    const arabicName = eclatRenderer.image(MOCK_ARABIC[0]!.profile, AR);
    expect(arabicName.texts.some((r) => r.face === "displayLight" && r.dir === "rtl")).toBe(true);
  });

  it("gives a dash its own run and no « OVR »", () => {
    const art = eclatRenderer.image(PROFILES.born0, FR);
    expect(art.texts.some((r) => r.text === "—")).toBe(true);
    expect(art.texts.some((r) => r.text === "OVR")).toBe(false);
  });
});
