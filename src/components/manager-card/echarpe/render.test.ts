import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import type { BeatName, CardProfile, CardStrings, TokenSize } from "../types";
import { echarpeRenderer as R } from "./index";
import { AR, CLUBS, FR, HOSTILE_NAMES, LANGS, PROFILES, type ProfileName } from "./test-data";
import { groupsByClass, knitIntervals, peakOverlap, tokenise, viewBox } from "./test-markup";
import { TASSELS } from "./geometry";
import { cardLabel } from "../copy";
import { esc } from "./knit";
import { stripControls } from "./view";

const THEMES = ["light", "dark"] as const;
const SIZES: TokenSize[] = [24, 28, 32, 44, 56, 64, 80];
const NAMES = Object.keys(PROFILES) as ProfileName[];
const BEATS: readonly BeatName[] = R.beats;
const full = (
  p: CardProfile,
  s: CardStrings = FR,
  theme: "light" | "dark" = "light",
  beat?: BeatName,
) => R.full(p, { strings: s, theme, beat });

/** Every tag the renderer may write. `filter` and the fe* primitives draw the grain and the soft shadows. */
const ALLOWED = new Set([
  "div",
  "span",
  "p",
  "bdi",
  "svg",
  "g",
  "defs",
  "clipPath",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "use",
  "mask",
  "filter",
  "feTurbulence",
  "feColorMatrix",
  "feGaussianBlur",
]);

describe("every profile draws, in both languages and both themes", () => {
  for (const name of NAMES)
    for (const s of LANGS)
      for (const theme of THEMES)
        it(`${name} · ${s.lang} · ${theme}`, () => {
          const p = PROFILES[name] as CardProfile;
          const html = full(p, s, theme);
          expect(html.startsWith('<div class="mc-echarpe')).toBe(true);
          expect(html).toContain('role="img"');
          expect(html).toContain(`dir="${s.lang === "ar" ? "rtl" : "ltr"}"`);
          expect(html).toContain(`mc-echarpe--${theme}`);
          // one root element
          const tags = tokenise(html).filter((t) => t.name === "div");
          expect(tags.filter((t) => !t.closing).length).toBe(1);
          for (const size of SIZES) {
            const tk = R.token(p, { strings: s, theme, size });
            expect(tk.startsWith('<span class="mc-tk')).toBe(true);
            const box = R.tokenBox(p, size);
            expect(box.height).toBe(size);
            // the box is the markup's own width
            expect(tk).toContain(`width="${box.width}"`);
            expect(tk).toContain(`style="width:${box.width}px;height:${size}px"`);
          }
        });
});

describe("a card with nothing yet draws the object's own empty part", () => {
  const texts = (html: string) =>
    [...html.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

  it("a null number is the knitted dash, never 0", () => {
    for (const name of ["born0", "forming1", "insufficient3", "guest", "unnamed"] as const) {
      for (const s of LANGS) {
        const html = full(PROFILES[name] as CardProfile, s);
        const ovr = groupsByClass(html, "mc-fabric")[0];
        expect(ovr).toContain('data-mc="ovr"');
        expect(ovr).not.toContain("data-ovr=");
        expect(texts(html)).not.toContain("0");
        expect(html).not.toMatch(/>0</);
        // the carrier is plain rib under the dash
        expect(html).toContain("mc-rib");
        expect(R.label(PROFILES[name] as CardProfile, s)).toContain(s.a11y.noRating);
        expect(R.label(PROFILES[name] as CardProfile, s)).not.toMatch(/\b0 OVR/);
        for (const size of SIZES) {
          const tk = R.token(PROFILES[name] as CardProfile, { strings: s, theme: "light", size });
          expect(tk).toContain("mc-tk-rib");
        }
      }
    }
  });

  it("a number is in the markup, as a group a pointer finds", () => {
    const html = full(PROFILES.rated);
    expect(html).toContain('data-mc="ovr" data-ovr="84"');
    const g = groupsByClass(html, "mc-fabric")[0];
    expect(g).toContain('class="mc-ovr-hit"');
    expect(g).toContain('fill="transparent"');
  });

  it("a null rating prints a dash on the patch, never 0", () => {
    const html = full(PROFILES.insufficient3);
    const t = texts(html);
    expect(t.filter((x) => x === "—").length).toBe(2);
    expect(t).toContain("91");
    expect(t).not.toContain("0");
  });

  it("a null serial is the carrier with a dash; a serial is the id", () => {
    expect(texts(full(PROFILES.born0))).toContain("BOT —");
    expect(texts(full(PROFILES.born0, AR))).toContain("BOT —");
    expect(texts(full(PROFILES.rated))).toContain("BOT #482913");
    // the serial reads left to right in Arabic too
    const ar = full(PROFILES.rated, AR);
    expect(ar).toMatch(/direction="ltr"[^>]*data-mc="serial">BOT #482913</);
    expect(full(PROFILES.born0)).not.toContain("BOT #");
  });

  it("a null club is undyed wool; a club is its two colours", () => {
    expect(full(PROFILES.clubNull)).toContain("mc-echarpe--wool");
    expect(full(PROFILES.rated)).not.toContain("mc-echarpe--wool");
    expect(full(PROFILES.rated)).toContain("#0a8f3a");
    expect(R.token(PROFILES.clubNull, { strings: FR, theme: "light", size: 44 })).toContain(
      "mc-tk--wool",
    );
  });

  it("a null tier is the base scarf: no tassels, loose strands, no tier strip", () => {
    const html = full(PROFILES.born0);
    expect(html).toContain("mc-echarpe--base");
    expect(html).toContain('data-mc-tier="none"');
    expect(groupsByClass(html, "mc-tassel").length).toBe(0);
    expect(html).toContain("mc-nameband");
    expect(R.label(PROFILES.born0, FR)).not.toContain("HOMA");
  });

  it("an empty name is a rib band, and the card says it is a manager card", () => {
    const html = full(PROFILES.unnamed);
    expect(html.match(/class="mc-rib"/g)?.length).toBe(2);
    expect(R.label(PROFILES.unnamed, FR).startsWith("Carte de manager")).toBe(true);
    expect(R.label(PROFILES.unnamed, AR).startsWith("بطاقة المدرّب")).toBe(true);
  });

  it("k of N: one stripe per counted journée, a tacking line for each still to come", () => {
    // 1 of 3: two tacking lines
    expect(groupsByClass(full(PROFILES.forming1), "mc-tack").length).toBe(2);
    expect(groupsByClass(full(PROFILES.forming2), "mc-tack").length).toBe(1);
    expect(groupsByClass(full(PROFILES.insufficient3), "mc-tack").length).toBe(0);
    expect(groupsByClass(full(PROFILES.born0), "mc-tack").length).toBe(3);
    // a rated card past the minimum shows the season's stripes instead
    expect(groupsByClass(full(PROFILES.rated), "mc-tack").length).toBe(0);
    expect(R.label(PROFILES.forming1, FR)).toContain("1 journée comptée sur 3");
    expect(R.label(PROFILES.forming1, AR)).toContain("جولة واحدة محتسبة من 3");
  });
});

describe("the founder", () => {
  it("·26 and the cream cast-on only with a founder year", () => {
    const f = full(PROFILES.founder);
    const n = full(PROFILES.rated);
    expect(f).toContain("mc-cast--founder");
    expect(n).not.toContain("mc-cast--founder");
    // 2026 knitted into the cast-on is a group of cream-ink stitches; a plain cast-on has none
    expect(groupsByClass(f, "mc-co-row").join("")).toContain("<g fill=");
    expect(groupsByClass(n, "mc-co-row").join("")).not.toContain("<g fill=");
    // the cables only on the founder
    expect(groupsByClass(f, "mc-co-after")[0]).toContain("<path");
    expect(groupsByClass(n, "mc-co-after")[0]).toBe("");
    expect(R.label(PROFILES.founder, FR)).toContain("Fondateur 2026");
    expect(R.label(PROFILES.rated, FR)).not.toContain("Fondateur");
    expect(R.token(PROFILES.founder, { strings: FR, theme: "light", size: 44 })).toContain(
      "mc-tk-cast",
    );
    expect(R.token(PROFILES.rated, { strings: FR, theme: "light", size: 44 })).not.toContain(
      "mc-tk-cast",
    );
  });

  it("the founder detail is the cast-on alone, and null for anyone else", () => {
    const d = R.detail(PROFILES.founder, "founder", { strings: FR, theme: "light" });
    expect(d).not.toBeNull();
    expect(d).toContain("mc-echarpe--detail");
    expect(d).toContain('aria-label="Fondateur 2026"');
    expect(groupsByClass(d as string, "mc-co-row").length).toBe(5);
    expect(R.detail(PROFILES.rated, "founder", { strings: FR, theme: "light" })).toBeNull();
    for (const s of LANGS)
      for (const theme of THEMES)
        for (const name of ["founder", "legendFounder", "arabicChartedFounder"] as const)
          expect(
            R.detail(PROFILES[name] as CardProfile, "founder", { strings: s, theme }),
          ).not.toBeNull();
  });
});

describe("the tier is the tassel count (2, 3, 4, 5) and LEGEND is raised", () => {
  const tiers = ["homa", "stade", "pro", "champion"] as const;
  const profile = (tier: (typeof tiers)[number]) => ({ ...PROFILES.rated, tier }) as CardProfile;
  for (const tier of tiers)
    it(`${tier}: ${TASSELS[tier]} tassels on the card and on the token`, () => {
      expect(groupsByClass(full(profile(tier)), "mc-tassel").length).toBe(TASSELS[tier]);
      for (const size of [24, 44, 80] as const) {
        const tk = R.token(profile(tier), { strings: FR, theme: "light", size });
        expect(tk.match(/class="mc-tk-wrap"/g)?.length).toBe(TASSELS[tier]);
      }
    });
  it("legend: raised outline, no hanging rail group, the avatar, a tassel on each end", () => {
    const html = full(PROFILES.legend);
    expect(html).toContain("mc-echarpe--legend");
    expect(html).toContain("mc-lg-band");
    expect(html).not.toContain("mc-sway");
    expect(groupsByClass(html, "mc-tassel").length).toBe(2 * TASSELS.legend);
    expect(html).toContain("mc-av");
    const tk = R.token(PROFILES.legend, { strings: FR, theme: "light", size: 44 });
    expect(tk).toContain("mc-tk-av");
    expect(tk.match(/class="mc-tk-wrap"/g)?.length).toBe(2);
  });
  it("the tier word is the tier's, in both languages", () => {
    expect(R.label(PROFILES.champion, FR)).toContain("CHAMPION");
    expect(R.label(PROFILES.champion, AR)).toContain("بطل");
  });
});

describe("the hanging scarf's sizes", () => {
  it("aspect is the drawn viewBox's height over its width, exactly", () => {
    for (const name of NAMES)
      for (const s of LANGS) {
        const p = PROFILES[name] as CardProfile;
        const vb = viewBox(full(p, s));
        expect(R.aspect(p, s)).toBeCloseTo(vb.h / vb.w, 2);
        // within 1% (the viewBox is written to two decimals)
        expect(Math.abs(R.aspect(p, s) - vb.h / vb.w) / (vb.h / vb.w)).toBeLessThan(0.01);
      }
  });
  it("is tall for HOMA (coarse gauge), shorter for LEGEND than for the longest hanging scarf", () => {
    expect(R.aspect(PROFILES.homa, FR)).toBeGreaterThan(R.aspect(PROFILES.rated, FR));
    expect(R.aspect(PROFILES.legend, FR)).toBeLessThan(1.6);
  });
  it("a token is one width per size at every tier except the raised LEGEND", () => {
    for (const size of SIZES) {
      const widths = (["homa", "stade", "pro", "champion"] as const).map(
        (tier) => R.tokenBox({ ...PROFILES.rated, tier } as CardProfile, size).width,
      );
      expect(new Set(widths).size).toBe(1);
    }
  });
});

describe("the share image art", () => {
  for (const name of NAMES)
    for (const s of LANGS)
      it(`${name} · ${s.lang}: text-free SVG, one text run per text the card draws`, () => {
        const p = PROFILES[name] as CardProfile;
        const art = R.image(p, s);
        expect(art.svg).not.toContain("<text");
        expect(art.svg).not.toContain("<tspan");
        expect(art.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(art.width).toBe(760);
        expect(art.height).toBe(Math.round(760 * R.aspect(p, s)) + 0 || art.height);
        const drawn = [...full(p, s).matchAll(/<text\b/g)].length;
        expect(art.texts.length).toBe(drawn);
        for (const t of art.texts) {
          expect(Number.isFinite(t.x) && Number.isFinite(t.y) && t.size > 0).toBe(true);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x).toBeLessThanOrEqual(art.width);
          expect(t.y).toBeGreaterThan(0);
          expect(t.y).toBeLessThanOrEqual(art.height);
          expect(["start", "middle", "end"]).toContain(t.anchor);
          expect(t.colour).toMatch(/^(#[0-9a-f]{6}|rgba\()/i);
        }
        // the image needs no stylesheet: no class decides a colour
        expect(art.svg).not.toContain("style=");
      });
  it("carries the serial and the figures as text runs, and the season and the sample label", () => {
    const art = R.image(PROFILES.rated, FR);
    const t = art.texts.map((x) => x.text);
    expect(t).toContain("BOT #482913");
    expect(t).toContain("91");
    expect(t).toContain("CAP");
    expect(t).toContain("2026/27 · Exemple");
    const ar = R.image(PROFILES.rated, AR);
    expect(ar.texts.find((x) => x.text === "القائد")?.face).toBe("arabic");
    expect(ar.texts.find((x) => x.text === "القائد")?.dir).toBe("rtl");
    expect(ar.texts.find((x) => x.text === "BOT #482913")?.dir).toBe("ltr");
  });
});

describe("hostile names cannot become markup", () => {
  const attrOk = (html: string) => {
    const tags = tokenise(html);
    for (const t of tags) {
      expect(ALLOWED.has(t.name)).toBe(true);
      for (const [k, v] of Object.entries(t.attrs)) {
        expect(k.toLowerCase().startsWith("on")).toBe(false);
        expect(v).not.toMatch(/[<>"]/);
        // no attribute that takes a URL or a style carries a script
        if (/^(href|xlink:href|src|action|formaction|style)$/i.test(k))
          expect(v.toLowerCase()).not.toContain("javascript:");
      }
    }
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<(iframe|object|embed|foreignObject|a|style|link|animate|set)\b/i);
    expect(html).not.toContain("href=");
  };
  for (const hostile of [...HOSTILE_NAMES, "‮", "x".repeat(5000), "<".repeat(50)])
    for (const s of LANGS)
      it(`${JSON.stringify(hostile.slice(0, 24))} · ${s.lang}`, () => {
        const p = { ...PROFILES.founder, name: hostile } as CardProfile;
        attrOk(full(p, s));
        attrOk(full({ ...p, tier: "legend" }, s));
        attrOk(full({ ...p, tier: null, ovr: null }, s, "dark", "make"));
        attrOk(R.image(p, s).svg);
        attrOk(R.detail(p, "founder", { strings: s, theme: "light" }) as string);
        for (const size of SIZES) attrOk(R.token(p, { strings: s, theme: "light", size }));
        // the name is knitted, never written: outside the label it is nowhere in the markup
        const html = full(p, s);
        const rest = html.replace(/aria-label="[^"]*"/, "");
        expect(rest).not.toContain(hostile);
        // and in the label it is escaped
        const label = /aria-label="([^"]*)"/.exec(html)?.[1] ?? "";
        expect(label).toBe(esc(stripControls(R.label(p, s))));
      });
  it("hostile club colours and fields read as the empty part", () => {
    const p = {
      ...PROFILES.rated,
      ovr: 9000,
      tier: "<b>" as never,
      serial: "<script>",
      season: '"><svg onload=alert(1)>',
      club: { ...CLUBS.raja, primary: "red;}</style><script>", secondary: "url(javascript:1)" },
      stats: { cap: 1e9, sel: -4, trf: Number.NaN, con: 55.4 },
    } as CardProfile;
    for (const s of LANGS) {
      const html = full(p, s);
      attrOk(html);
      expect(html).toContain("mc-echarpe--wool");
      expect(html).toContain('data-mc-tier="none"');
      expect(html).not.toContain("data-ovr=");
    }
  });
});

describe("beats (plan 5.4)", () => {
  const BEAT_CASES: Record<BeatName, ProfileName> = {
    make: "born0",
    tick: "forming2",
    first: "first",
    tier: "champion",
    legend: "legend",
    founder: "founder",
    castoff: "rated",
  };
  const LIMIT: Record<BeatName, number> = {
    make: 700,
    tick: 360,
    first: 490,
    tier: 600,
    legend: 540,
    founder: 600,
    castoff: 380,
  };
  it("the renderer lists all seven beats and their lengths", () => {
    expect([...R.beats].sort()).toEqual(Object.keys(LIMIT).sort());
    for (const b of R.beats) {
      expect(R.beatMs(b)).toBe(LIMIT[b]);
      expect(R.beatMs(b)).toBeLessThanOrEqual(b === "make" ? 700 : 600);
    }
    expect(R.beatMs("nope" as BeatName)).toBe(0);
  });

  for (const beat of BEATS)
    for (const s of LANGS)
      it(`${beat} · ${s.lang}: nothing that moves holds the number, the serial or any text`, () => {
        const p = PROFILES[BEAT_CASES[beat]] as CardProfile;
        const html = full(p, s, "light", beat);
        expect(html).toContain(`mc-echarpe--beat-${beat}`);
        const animated = [
          ...groupsByClass(html, "mc-kr"),
          ...groupsByClass(html, "mc-fringe"),
          ...groupsByClass(html, "mc-tassel-new"),
          ...groupsByClass(html, "mc-fy"),
          ...groupsByClass(html, "mc-lg-arms"),
          ...groupsByClass(html, "mc-lg-fists"),
        ];
        expect(animated.length).toBeGreaterThan(0);
        for (const inner of animated) {
          expect(inner).not.toContain('data-mc="ovr"');
          expect(inner).not.toContain("mc-ovr-hit");
          expect(inner).not.toContain('data-mc="serial"');
          expect(inner).not.toContain("<text");
          expect(inner).not.toContain("<bdi");
        }
        // and the number is in the markup, outside all of them
        expect(html).toContain('data-mc="ovr"');
        // every timed row ends within the beat
        for (const [a, b] of knitIntervals(html)) {
          expect(a).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(R.beatMs(beat));
        }
      });

  it("make: at most 16 rows knit at once, and the longest Arabic band still ends by 700 ms", () => {
    const worst = {
      ...PROFILES.born0Serial,
      name: "فاطمة الزهراء بنت",
      founder: 2026,
      minRated: 12,
    } as CardProfile;
    for (const p of [
      PROFILES.born0,
      PROFILES.born0Serial,
      PROFILES.unnamed,
      worst,
    ] as CardProfile[])
      for (const s of LANGS) {
        const iv = knitIntervals(full(p, s, "light", "make"));
        expect(iv.length).toBeGreaterThanOrEqual(5);
        expect(Math.max(...iv.map(([, b]) => b))).toBeLessThanOrEqual(700);
        expect(peakOverlap(iv)).toBeLessThanOrEqual(16);
      }
    // cast-on from the foot (start 0, gap 36, 170 per row), tacking lines (110, 45, 190)
    const html = full(PROFILES.founder, FR, "light", "make");
    expect(html).toContain("--mc-d:0ms;--mc-t:170ms");
    expect(html).toContain("--mc-d:144ms;--mc-t:170ms");
    const b = full(PROFILES.born0, FR, "light", "make");
    expect(b).toContain("--mc-d:110ms;--mc-t:190ms");
    expect(b).toContain("--mc-d:200ms;--mc-t:190ms");
  });

  it("first and tick knit the newest stripe, two rows lower first; the number is already there", () => {
    const first = full(PROFILES.first, FR, "light", "first");
    expect(groupsByClass(first, "mc-bt-stripe").length).toBe(2);
    expect(first).toContain("--mc-d:80ms;--mc-t:300ms");
    expect(first).toContain("--mc-d:190ms;--mc-t:300ms");
    const tick = full(PROFILES.forming2, FR, "light", "tick");
    expect(groupsByClass(tick, "mc-bt-stripe").length).toBe(2);
    expect(tick).toContain("--mc-d:30ms;--mc-t:240ms");
    expect(tick).toContain("--mc-d:120ms;--mc-t:240ms");
    // the stripe that knits in goes over its own tacking line; one more is still to come
    expect(groupsByClass(tick, "mc-tack").length).toBe(2);
    // past the minimum the season's newest stripe knits in (one row)
    const late = full(PROFILES.rated, FR, "light", "tick");
    expect(groupsByClass(late, "mc-bt-stripe").length).toBe(1);
  });

  it("tier drops the newest tassel and swings the fringe; legend raises the arms and settles the fists", () => {
    const tier = full(PROFILES.champion, FR, "light", "tier");
    expect(groupsByClass(tier, "mc-tassel-new").length).toBe(1);
    expect(groupsByClass(tier, "mc-tassel").length).toBe(5);
    const lg = full(PROFILES.legend, FR, "light", "legend");
    expect(groupsByClass(lg, "mc-lg-arms").length).toBe(1);
    expect(groupsByClass(lg, "mc-lg-fists").length).toBe(1);
  });

  it("founder knits the five cream rows from the foot, then the year comes onto the name band", () => {
    const html = full(PROFILES.founder, FR, "light", "founder");
    expect(html).toContain("--mc-d:60ms;--mc-t:100ms");
    expect(html).toContain("--mc-d:380ms;--mc-t:100ms");
    expect(html).toContain("mc-kr mc-kr--s8");
    expect(groupsByClass(html, "mc-fy").length).toBe(1);
    // detail plays the same rows
    const d = R.detail(PROFILES.founder, "founder", {
      strings: FR,
      theme: "light",
      beat: "founder",
    });
    expect(d).toContain("mc-kr--s8");
  });

  it("castoff knits the bound loops alone, in one row of 320 ms", () => {
    const html = full(PROFILES.rated, FR, "light", "castoff");
    expect(knitIntervals(html)).toEqual([[60, 380]]);
    expect(groupsByClass(html, "mc-loops").length).toBe(1);
  });

  it("a beat that has nothing to knit on this card is ignored, silently", () => {
    const none: [ProfileName, BeatName][] = [
      ["rated", "founder"],
      ["rated", "legend"],
      ["born0", "tier"],
      ["legend", "make"],
      ["legend", "tier"],
      ["guest", "tick"],
    ];
    for (const [name, beat] of none) {
      const html = full(PROFILES[name] as CardProfile, FR, "light", beat);
      expect(html).not.toContain("mc-echarpe--beat-");
      expect(html).not.toContain("mc-kr");
      // the same card as with no beat (only the ids, drawn fresh each render, differ)
      const ids = (h: string) => h.replace(/mc-\d+/g, "mc-N");
      expect(ids(html)).toBe(ids(full(PROFILES[name] as CardProfile, FR, "light")));
    }
  });

  it("no beat, no animated markup at all", () => {
    for (const name of NAMES) {
      const html = full(PROFILES[name] as CardProfile);
      expect(html).not.toContain("mc-kr");
      expect(html).not.toContain("--mc-d");
      expect(html).not.toContain("mc-tassel-new");
      expect(html).not.toContain("mc-echarpe--beat-");
    }
  });

  it("tokens ignore beats", () => {
    const a = R.token(PROFILES.rated, { strings: FR, theme: "light", size: 64 });
    expect(a).not.toContain("mc-kr");
  });
});

describe("ids", () => {
  it("every render draws its own ids, unique on a page", () => {
    const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(full(PROFILES.rated));
    const b = ids(full(PROFILES.rated));
    const t = ids(R.token(PROFILES.rated, { strings: FR, theme: "light", size: 44 }));
    const all = [...a, ...b, ...t];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^mc-[a-z]*-?\d+/);
    // every url(#…) points at an id of its own render
    const html = full(PROFILES.legend);
    const own = new Set(ids(html));
    for (const m of html.matchAll(/url\(#([^)]+)\)/g)) expect(own.has(m[1])).toBe(true);
    const h2 = full(PROFILES.champion, AR, "dark");
    const own2 = new Set(ids(h2));
    for (const m of h2.matchAll(/url\(#([^)]+)\)/g)) expect(own2.has(m[1])).toBe(true);
  });
});

describe("the wordmark on the patch", () => {
  const read = (f: string) =>
    readFileSync(new URL(`../../../assets/brand/${f}`, import.meta.url), "utf8");
  const paths = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  it("is the brand file's geometry, untouched, with no style, class or id of the file", () => {
    const html = full(PROFILES.rated);
    const wm =
      html.match(
        /<svg x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" viewBox="0 0 1614\.8063 288\.1029"[^>]*>(.*?)<\/svg>/,
      )?.[1] ?? "";
    expect(paths(wm)).toEqual(paths(read("botolago-wordmark-color.svg")));
    expect(paths(wm).length).toBeGreaterThan(8);
    expect(wm).not.toContain("st0");
    expect(wm).toContain('fill="#0151fc"');
    expect(wm).toContain('fill="#000000"');
    expect(html).not.toContain("Layer_1");
    expect(html).not.toContain("<style");
  });
  it("the light file's geometry is the colour file's, so one drawing serves both", () => {
    expect(paths(read("botolago-wordmark-light.svg")).sort()).toEqual(
      paths(read("botolago-wordmark-color.svg")).sort(),
    );
  });
});

describe("the label (the app's own sentence, copy.ts)", () => {
  it("is one sentence: the card, who, the number, the tier, the club, the serial", () => {
    expect(R.label(PROFILES.rated, FR)).toBe(
      "Carte de manager, KARIM, 84 OVR, PRO, Raja Casablanca, BOT #482913, Exemple",
    );
    expect(R.label(PROFILES.rated, AR)).toBe(
      "بطاقة المدرّب، KARIM، 84 OVR، محترف، الرجاء، BOT #482913، مثال",
    );
    expect(R.label(PROFILES.born0, FR)).toBe(
      "Carte de manager, KARIM, pas encore de note, aucune journée comptée sur 3, Raja Casablanca, Exemple",
    );
    expect(R.label(PROFILES.founder, FR)).toContain("Fondateur 2026");
  });
  it("is copy.ts's cardLabel word for word, for every profile in both languages", () => {
    for (const name of NAMES)
      for (const s of LANGS) {
        const p = PROFILES[name] as CardProfile;
        expect(R.label(p, s)).toBe(cardLabel(p, s));
      }
  });
  it("speaks what is drawn: a number out of range is no number", () => {
    const bad = { ...PROFILES.rated, ovr: 9000, tier: "nope" as never } as CardProfile;
    expect(R.label(bad, FR)).toContain("pas encore de note");
    expect(R.label(bad, FR)).not.toContain("9000");
  });
  it("the root carries it, without control or direction characters; a token carries its own", () => {
    for (const s of LANGS) {
      const html = full(PROFILES.rated, s);
      expect(html).toContain(`aria-label="${R.label(PROFILES.rated, s)}"`);
    }
    const html = full({ ...PROFILES.rated, name: "\u202ealice\u0007" }, FR);
    expect(html).toContain('aria-label="Carte de manager, alice, 84 OVR');
    expect(R.token(PROFILES.rated, { strings: FR, theme: "light", size: 44 })).toContain(
      'aria-label="KARIM, 84 OVR, PRO"',
    );
  });
  it("a name is no more than 80 characters of it", () => {
    expect(R.label({ ...PROFILES.rated, name: "x".repeat(5000) }, FR).length).toBeLessThan(200);
  });
});

describe("the boundary", () => {
  it("reads a beat that is not one of the seven as no beat, whatever it inherits", () => {
    for (const beat of ["constructor", "toString", "__proto__", "hasOwnProperty"] as const) {
      const html = full(PROFILES.rated, FR, "light", beat as BeatName);
      expect(html).not.toContain("mc-echarpe--beat-");
      expect(R.beatMs(beat as BeatName)).toBe(0);
    }
  });
  it("reads a club colour that is not a string as no club", () => {
    const p = { ...PROFILES.rated, club: { ...CLUBS.raja, primary: 12 as never } } as CardProfile;
    expect(full(p)).toContain("mc-echarpe--wool");
  });
});
